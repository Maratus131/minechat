package ru.msrpo.chat.notification;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.push")
public record PushProperties(String publicKey, String privateKey, String subject) {
    public PushProperties {
        publicKey = publicKey == null ? "" : publicKey.strip();
        privateKey = privateKey == null ? "" : privateKey.strip();
        subject = subject == null ? "" : subject.strip();
        boolean any = !publicKey.isEmpty() || !privateKey.isEmpty() || !subject.isEmpty();
        if (any && (publicKey.isEmpty() || privateKey.isEmpty() || subject.isEmpty()))
            throw new IllegalArgumentException("Configure all WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY and WEB_PUSH_SUBJECT");
        if (any && !subject.startsWith("https://") && !subject.startsWith("mailto:"))
            throw new IllegalArgumentException("WEB_PUSH_SUBJECT must be an HTTPS URL or mailto address");
    }
    public boolean enabled() { return !publicKey.isEmpty(); }
    @Override public String toString() { return "PushProperties[enabled=" + enabled() + "]"; }
}
