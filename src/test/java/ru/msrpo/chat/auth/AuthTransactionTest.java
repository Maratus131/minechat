package ru.msrpo.chat.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import ru.msrpo.chat.user.ChatUser;
import ru.msrpo.chat.user.UserRepository;
import javax.sql.DataSource;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:authtransaction;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.hikari.maximum-pool-size=2",
    "spring.datasource.hikari.minimum-idle=1",
    "spring.datasource.hikari.connection-timeout=1000"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthTransactionTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate database;
    @Autowired UserRepository users;
    @Autowired DataSource dataSource;
    @MockitoSpyBean PasswordEncoder passwords;

    @Test void registrationDoesNotHoldTheOnlyDatabaseConnectionWhileHashing() throws Exception {
        assertPasswordWorkReleasesConnection(true, username(), 201);
    }

    @Test void loginDoesNotHoldTheOnlyDatabaseConnectionWhileCheckingPassword() throws Exception {
        var user = createUser();
        assertPasswordWorkReleasesConnection(false, user.getUsername(), 200);
    }

    @Test void unknownLoginStillChecksADummyBcryptHashOutsideDatabaseTransaction() throws Exception {
        assertPasswordWorkReleasesConnection(false, username(), 401);
    }

    @Test void disabledAccountCannotReceiveATokenEvenWithCorrectPassword() throws Exception {
        var user = createUser();
        database.update("update chat_users set enabled=false where id=?", user.getId());
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
            .content("{\"username\":\"" + user.getUsername() + "\",\"password\":\"password123\"}"))
            .andExpect(status().isUnauthorized());
    }

    private void assertPasswordWorkReleasesConnection(boolean registration, String username, int expectedStatus) throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var transactionDuringPasswordWork = new AtomicBoolean();
        org.mockito.stubbing.Answer<Object> pause = invocation -> {
            transactionDuringPasswordWork.set(TransactionSynchronizationManager.isActualTransactionActive());
            if (!registration) assertThat((String) invocation.getArgument(1)).startsWith("$2a$12$");
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Password test did not release its latch");
            return invocation.callRealMethod();
        };
        if (registration) doAnswer(pause).when(passwords).encode(any(CharSequence.class));
        else doAnswer(pause).when(passwords).matches(any(CharSequence.class), anyString());

        var workers = Executors.newFixedThreadPool(2);
        Future<?> request = null;
        // Flyway needs two connections during startup. Reserve one afterwards so the request
        // and an unrelated read have exactly one available connection to share.
        try (var reserved = dataSource.getConnection()) {
            request = workers.submit(() -> mvc.perform(post("/api/v1/auth/" + (registration ? "register" : "login"))
                .contentType("application/json").content("{\"username\":\"" + username
                    + "\"" + (registration ? ",\"displayName\":\"Transaction test\"" : "") + ",\"password\":\"password123\"}"))
                .andExpect(status().is(expectedStatus)));
            assertThat(entered.await(3, TimeUnit.SECONDS)).as("Password encoder was reached").isTrue();
            var unrelatedRead = workers.submit(() -> database.queryForObject("select 1", Integer.class));
            assertAll(
                () -> assertThat(transactionDuringPasswordWork.get()).as("BCrypt must execute outside a DB transaction").isFalse(),
                () -> assertThat(unrelatedRead.get(2, TimeUnit.SECONDS)).as("The only DB connection remains available").isEqualTo(1)
            );
        } finally {
            release.countDown();
            try { if (request != null) request.get(5, TimeUnit.SECONDS); }
            finally { workers.shutdownNow(); }
        }
    }

    private ChatUser createUser() {
        return users.saveAndFlush(ChatUser.create(username(), "Transaction test", new BCryptPasswordEncoder(12).encode("password123")));
    }
    private static String username() { return "tx_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20); }
}
