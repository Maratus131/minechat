package ru.msrpo.chat.search;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import ru.msrpo.chat.message.MessageRepository;

@Service
public class SearchIndexWorker {
    private final MessageRepository messages;
    private final ElasticsearchOperations elasticsearch;
    private final TransactionTemplate transactions;

    public SearchIndexWorker(MessageRepository messages, ElasticsearchOperations elasticsearch, PlatformTransactionManager transactionManager) {
        this.messages = messages; this.elasticsearch = elasticsearch;
        this.transactions = new TransactionTemplate(transactionManager);
    }
    public void indexPending() {
        var index = elasticsearch.indexOps(MessageDocument.class);
        if (!index.exists()) {
            // Commit the reset before creating the index. If creation/indexing fails, rebuilding remains pending.
            transactions.executeWithoutResult(status -> messages.resetIndexing());
            index.createWithMapping();
        }
        // The durable flag and retry with the same document ID make temporary ES failures recoverable.
        transactions.executeWithoutResult(status -> {
            for (var message : messages.findBySearchIndexedFalseOrderByIdAsc(PageRequest.of(0, 100))) {
                if (message.isDeleted()) elasticsearch.delete(message.getId().toString(), MessageDocument.class);
                else elasticsearch.save(MessageDocument.from(message));
                message.markIndexed();
            }
        });
    }
}
