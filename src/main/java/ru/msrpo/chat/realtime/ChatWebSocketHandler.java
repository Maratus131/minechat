package ru.msrpo.chat.realtime;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@RequiredArgsConstructor
public class ChatWebSocketHandler extends TextWebSocketHandler {
    private final WebSocketEventService events;

    @Override public void afterConnectionEstablished(WebSocketSession session) { events.open(session); }
    @Override protected void handleTextMessage(WebSocketSession session, TextMessage message) { events.authenticate(session.getId(), message.getPayload()); }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { events.remove(session.getId()); }
    @Override public void handleTransportError(WebSocketSession session, Throwable error) { events.close(session.getId(), CloseStatus.SERVER_ERROR); }
}
