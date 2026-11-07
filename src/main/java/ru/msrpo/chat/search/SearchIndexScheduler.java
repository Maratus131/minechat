package ru.msrpo.chat.search;

import lombok.RequiredArgsConstructor;
import org.slf4j.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.search.scheduling-enabled", havingValue = "true", matchIfMissing = true)
public class SearchIndexScheduler {
    private static final Logger log = LoggerFactory.getLogger(SearchIndexScheduler.class);
    private final SearchIndexWorker worker;
    private boolean unavailable;
    @Scheduled(fixedDelayString = "${app.search.interval-ms:3000}")
    public void run() {
        try {
            worker.indexPending();
            if (unavailable) log.info("Search indexing recovered");
            unavailable = false;
        } catch (RuntimeException error) {
            if (!unavailable) log.warn("Search indexing unavailable; pending messages will be retried", error);
            unavailable = true;
        }
    }
}
