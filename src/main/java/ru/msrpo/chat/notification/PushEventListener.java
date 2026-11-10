package ru.msrpo.chat.notification;

import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import ru.msrpo.chat.realtime.MessageCreated;
import java.util.concurrent.*;

@Component
@RequiredArgsConstructor
public class PushEventListener {
    private static final Logger log = LoggerFactory.getLogger(PushEventListener.class);
    private final PushDeliveryService delivery;
    private final PushProperties properties;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(100), runnable -> {
            var thread = new Thread(runnable, "web-push"); thread.setDaemon(true); return thread;
        });

    @TransactionalEventListener
    public void created(MessageCreated event) {
        if (!properties.enabled()) return;
        try {
            workers.execute(() -> {
                try { for (var target : delivery.prepare(event)) delivery.deliver(target); }
                catch (Exception error) { log.warn("Web Push preparation failed ({})", error.getClass().getSimpleName()); }
            });
        } catch (RejectedExecutionException error) { log.warn("Web Push queue is full; notification skipped"); }
    }
    @PreDestroy void close() { workers.shutdownNow(); }
}
