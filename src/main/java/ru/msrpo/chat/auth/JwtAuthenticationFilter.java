package ru.msrpo.chat.auth;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import ru.msrpo.chat.user.UserRepository;
import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService tokens;
    private final UserRepository users;
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null) { chain.doFilter(request, response); return; }
        final ChatPrincipal principal;
        try {
            if (!header.regionMatches(true, 0, "Bearer ", 0, 7)) throw new JwtException("Invalid authorization");
            principal = tokens.validate(header.substring(7).trim());
        } catch (JwtException | IllegalArgumentException error) {
            unauthorized(response); return;
        }
        var user = users.findById(principal.id());
        if (user.isEmpty() || !user.get().isEnabled()) { unauthorized(response); return; }
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
        SecurityContextHolder.setContext(context);
        chain.doFilter(request, response);
    }
    public static void unauthorized(HttpServletResponse response) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(401);
        response.setHeader("WWW-Authenticate", "Bearer");
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401}");
    }
}
