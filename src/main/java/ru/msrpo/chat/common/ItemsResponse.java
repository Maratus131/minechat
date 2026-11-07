package ru.msrpo.chat.common;

import java.util.List;

public record ItemsResponse<T>(List<T> items, boolean hasMore) {
    public static <T> ItemsResponse<T> from(List<T> items, int limit) {
        return new ItemsResponse<>(List.copyOf(items.subList(0, Math.min(items.size(), limit))), items.size() > limit);
    }
    public static void validateLimit(int limit) {
        if (limit < 1 || limit > 100) throw ApiException.badRequest("limit должен быть от 1 до 100");
    }
}
