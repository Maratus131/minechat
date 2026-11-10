package ru.msrpo.chat.auth;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

final class SessionTokens {
    private static final SecureRandom RANDOM = new SecureRandom();
    private SessionTokens() {}
    static String create() {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static boolean valid(String token) { return token != null && token.matches("[A-Za-z0-9_-]{43}"); }
    static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
