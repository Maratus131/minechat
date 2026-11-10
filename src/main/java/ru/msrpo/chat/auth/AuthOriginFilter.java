package ru.msrpo.chat.auth;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import ru.msrpo.chat.config.SecurityConfig;
import java.io.IOException;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class AuthOriginFilter extends OncePerRequestFilter {
    private static final Set<String> COOKIE_ENDPOINTS = Set.of("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout");
    private final SecurityConfig.CorsProperties cors;
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !COOKIE_ENDPOINTS.contains(request.getRequestURI().substring(request.getContextPath().length()));
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        String origin = request.getHeader("Origin");
        if (origin != null && !cors.allowedOrigins().contains(origin)) {
            response.setStatus(403); response.setContentType("application/problem+json");
            response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Forbidden\",\"status\":403}"); return;
        }
        chain.doFilter(request, response);
    }
}
