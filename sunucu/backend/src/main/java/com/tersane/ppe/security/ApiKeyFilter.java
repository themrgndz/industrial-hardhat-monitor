package com.tersane.ppe.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {

    private final byte[] expectedKey;

    public ApiKeyFilter(@Value("${app.api-key}") String apiKey) {
        this.expectedKey = apiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        String provided = request.getHeader("X-API-KEY");
        byte[] providedBytes = provided == null ? new byte[0] : provided.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expectedKey, providedBytes)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"invalid api key\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
