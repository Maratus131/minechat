package ru.msrpo.chat.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PersistentSessionApiTest {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate database;

    @Test void webCookieRestoresLoginAndNeverExposesRefreshTokenOrStoresItRaw() throws Exception {
        var registered = register(false);
        var cookie = cookie(registered);
        String header = registered.getResponse().getHeader("Set-Cookie");
        assertThat(header).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth", "Max-Age=2592000");
        var original = body(registered);
        assertThat(original.has("refreshToken")).isFalse();
        assertThat(original.has("refreshExpiresIn")).isFalse();
        assertThat(cookie.getValue()).hasSize(43);
        String hash = database.queryForObject("select token_hash from auth_sessions where user_id=?", String.class,
            UUID.fromString(original.path("user").path("id").asText()));
        assertThat(hash).hasSize(64).isEqualTo(SessionTokens.hash(cookie.getValue())).isNotEqualTo(cookie.getValue());
        var restored = mvc.perform(post("/api/v1/auth/refresh").cookie(cookie)).andExpect(status().isOk())
            .andExpect(jsonPath("$.refreshToken").doesNotExist()).andReturn();
        assertThat(body(restored).path("user").path("id").asText()).isEqualTo(original.path("user").path("id").asText());
        assertThat(body(restored).path("accessToken").asText()).isNotEqualTo(original.path("accessToken").asText());
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + body(restored).path("accessToken").asText()))
            .andExpect(status().isOk());
        // Stable refresh capability is reusable by parallel tabs; refresh does not extend its lifetime.
        mvc.perform(post("/api/v1/auth/refresh").cookie(cookie)).andExpect(status().isOk());
        assertThat(restored.getResponse().getHeader("Set-Cookie")).isNull();
    }

    @Test void invalidExpiredAndDisabledWebSessionsAreRejectedWithoutOverwritingAnotherTabsCookie() throws Exception {
        mvc.perform(post("/api/v1/auth/refresh")).andExpect(status().isUnauthorized()).andExpect(header().doesNotExist("Set-Cookie"));
        mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(SessionCookie.NAME, SessionTokens.create())))
            .andExpect(status().isUnauthorized()).andExpect(header().doesNotExist("Set-Cookie"));
        var expired = register(false); var expiredCookie = cookie(expired);
        database.update("update auth_sessions set expires_at=? where token_hash=?", java.sql.Timestamp.from(Instant.now().minusSeconds(1)), SessionTokens.hash(expiredCookie.getValue()));
        mvc.perform(post("/api/v1/auth/refresh").cookie(expiredCookie)).andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist("Set-Cookie"));
        var disabled = register(false);
        database.update("update chat_users set enabled=false where id=?", UUID.fromString(body(disabled).path("user").path("id").asText()));
        mvc.perform(post("/api/v1/auth/refresh").cookie(cookie(disabled))).andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist("Set-Cookie"));
    }

    @Test void browserAndDeviceLogoutsRevokeOnlyTheirOwnSessionsAndRemainIdempotent() throws Exception {
        var first = register(false); var firstCookie = cookie(first);
        String username = body(first).path("user").path("username").asText();
        String credentials = json.writeValueAsString(Map.of("username", username, "password", "password123"));
        var second = mvc.perform(post("/api/v1/auth/login").contentType("application/json").content(credentials)).andExpect(status().isOk()).andReturn();
        var secondCookie = cookie(second);
        var device = mvc.perform(post("/api/v1/auth/device/login").contentType("application/json").content(credentials)).andExpect(status().isOk()).andReturn();
        assertThat(device.getResponse().getHeader("Set-Cookie")).isNull();
        String token = body(device).path("refreshToken").asText();
        assertThat(token).hasSize(43);
        assertThat(body(device).path("refreshExpiresIn").asLong()).isBetween(2591990L, 2592000L);
        assertThat(token).isNotEqualTo(firstCookie.getValue()).isNotEqualTo(secondCookie.getValue());
        String refreshBody = json.writeValueAsString(Map.of("refreshToken", token));
        mvc.perform(post("/api/v1/auth/logout").cookie(firstCookie)).andExpect(status().isNoContent())
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
        mvc.perform(post("/api/v1/auth/logout").cookie(firstCookie)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/refresh").cookie(firstCookie)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").cookie(secondCookie)).andExpect(status().isOk());
        var refreshed = mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json").content(refreshBody))
            .andExpect(status().isOk()).andReturn();
        assertThat(body(refreshed).path("refreshToken").asText()).isEqualTo(token);
        mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json")
            .content(json.writeValueAsString(Map.of("refreshToken", secondCookie.getValue())))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(SessionCookie.NAME, token))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/device/logout").contentType("application/json").content(refreshBody)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/device/logout").contentType("application/json").content(refreshBody)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json").content(refreshBody)).andExpect(status().isUnauthorized());
    }

    @Test void rejectsCrossOriginCookieActionsAndAllowsExactCredentialedOrigin() throws Exception {
        var account = register(false); var cookie = cookie(account);
        for (String origin : List.of("https://evil.example", "null", "http://localhost:5173.evil.example")) {
            mvc.perform(post("/api/v1/auth/refresh").header("Origin", origin).cookie(cookie)).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/auth/logout").header("Origin", origin).cookie(cookie)).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/auth/login").header("Origin", origin).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/auth/register").header("Origin", origin).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/auth/refresh").header("Origin", "http://localhost:5173").cookie(cookie)).andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
            .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/v1/auth/refresh").header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "POST")).andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test void deviceRegistrationReturnsNoCookieAndValidatesRefreshRequests() throws Exception {
        var registered = register(true); String token = body(registered).path("refreshToken").asText();
        assertThat(registered.getResponse().getHeader("Set-Cookie")).isNull();
        assertThat(token).hasSize(43);
        mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json").content("{\"refreshToken\":\"wrong\"}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/device/refresh").contentType("application/json").content(json.writeValueAsString(Map.of("refreshToken", token))))
            .andExpect(status().isOk());
    }

    private MvcResult register(boolean device) throws Exception {
        return mvc.perform(post("/api/v1/auth/" + (device ? "device/" : "") + "register").contentType("application/json")
            .content(json.writeValueAsString(Map.of("username", "s" + UUID.randomUUID().toString().replace("-", "").substring(0, 20),
                "displayName", "Session test", "password", "password123")))).andExpect(status().isCreated()).andReturn();
    }
    private JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    private static Cookie cookie(MvcResult result) {
        String header = Objects.requireNonNull(result.getResponse().getHeader("Set-Cookie"));
        return new Cookie(SessionCookie.NAME, header.substring(header.indexOf('=') + 1, header.indexOf(';')));
    }
}
