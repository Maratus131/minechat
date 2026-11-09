package ru.msrpo.chat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import ru.msrpo.chat.search.*;
import ru.msrpo.chat.message.MessageRepository;
import java.util.concurrent.*;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers
class InfrastructureIT extends ChatApiTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
    @Container static final ElasticsearchContainer elastic = new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:9.2.8")
        .withEnv("xpack.security.enabled", "false").withEnv("ES_JAVA_OPTS", "-Xms512m -Xmx512m")
        .withStartupTimeout(Duration.ofMinutes(3));
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.elasticsearch.uris", elastic::getHttpHostAddress);
    }
    @Autowired SearchIndexWorker indexer;
    @MockitoSpyBean ElasticsearchOperations elasticsearch;
    @Autowired MessageRepository messageRepository;

    @Test
    void editingDuringIndexingKeepsNewTextPendingAndReplacesSearchTerms() throws Exception {
        var alice = register(); var bob = register(); String conversation = dialog(alice, bob);
        long id = send(alice, conversation, "staleoldmarker").path("id").asLong();
        indexer.indexPending();
        elasticsearch.indexOps(MessageDocument.class).refresh();
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", conversation).param("q", "staleoldmarker")
                .header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items.length()").value(1));
        edit(alice, conversation, id, "staleoldmarker indexed snapshot");
        var indexingStarted = new CountDownLatch(1); var allowIndexing = new CountDownLatch(1);
        doAnswer(invocation -> {
            MessageDocument document = invocation.getArgument(0);
            if (document.messageId() == id) {
                indexingStarted.countDown();
                if (!allowIndexing.await(15, TimeUnit.SECONDS)) throw new AssertionError("Indexing was not released");
            }
            return invocation.callRealMethod();
        }).when(elasticsearch).save(any(MessageDocument.class));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var indexing = executor.submit(indexer::indexPending);
            try {
                assertThat(indexingStarted.await(10, TimeUnit.SECONDS)).isTrue();
                var editing = executor.submit(() -> edit(alice, conversation, id, "editedfreshmarker"));
                assertThatThrownBy(() -> editing.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                allowIndexing.countDown();
                indexing.get(15, TimeUnit.SECONDS);
                editing.get(15, TimeUnit.SECONDS);
            } finally { allowIndexing.countDown(); }
        } finally { reset(elasticsearch); }
        var changed = messageRepository.findById(id).orElseThrow();
        assertThat(changed.getText()).isEqualTo("editedfreshmarker");
        assertThat(changed.isSearchIndexed()).isFalse();
        indexer.indexPending();
        elasticsearch.indexOps(MessageDocument.class).refresh();
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", conversation).param("q", "editedfreshmarker")
                .header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items.length()").value(1));
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", conversation).param("q", "staleoldmarker")
                .header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items.length()").value(0));
    }

    @Test
    void failedIndexingIsRetriedAndDoesNotPreventSending() throws Exception {
        var alice = register(); var bob = register(); String dialog = dialog(alice, bob);
        long id = send(alice, dialog, "recoverable-message").path("id").asLong();
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("simulated ES outage"))
            .when(elasticsearch).save(any(MessageDocument.class));
        assertThatThrownBy(indexer::indexPending).isInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class);
        assertThat(messageRepository.findById(id).orElseThrow().isSearchIndexed()).isFalse();
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("simulated ES outage"))
            .when(elasticsearch).search(any(org.springframework.data.elasticsearch.core.query.Query.class), eq(MessageDocument.class));
        send(alice, dialog, "Sending still works");
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", dialog).param("q", "recoverable")
                .header("Authorization", bearer(bob))).andExpect(status().isServiceUnavailable());
        reset(elasticsearch);
        indexer.indexPending();
        assertThat(messageRepository.findById(id).orElseThrow().isSearchIndexed()).isTrue();
    }

    @Test
    void indexesSearchesOnlySelectedDialogAndRebuildsLostIndex() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String ab = dialog(alice, bob); String ae = dialog(alice, eve);
        send(alice, ab, "уникальныйтекст публичный для Боба");
        send(alice, ae, "уникальныйтекст секрет для Евы");
        indexer.indexPending();
        elasticsearch.indexOps(MessageDocument.class).refresh();
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", ab).param("q", "уникальныйтекст")
                .header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items.length()").value(1))
            .andExpect(jsonPath("items[0].conversationId").value(ab));
        elasticsearch.indexOps(MessageDocument.class).delete();
        indexer.indexPending();
        elasticsearch.indexOps(MessageDocument.class).refresh();
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", ae).param("q", "уникальныйтекст")
                .header("Authorization", bearer(eve)))
            .andExpect(status().isOk()).andExpect(jsonPath("items.length()").value(1));
    }
    @Test
    void simultaneousDialogCreationReturnsSameDialog() throws Exception {
        var alice = register(); var bob = register();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var ready = new CountDownLatch(2);
            Callable<String> fromAlice = () -> { ready.countDown(); ready.await(); return dialog(alice, bob); };
            Callable<String> fromBob = () -> { ready.countDown(); ready.await(); return dialog(bob, alice); };
            var first = executor.submit(fromAlice);
            var second = executor.submit(fromBob);
            assertThat(first.get(15, TimeUnit.SECONDS)).isEqualTo(second.get(15, TimeUnit.SECONDS));
        }
    }
}
