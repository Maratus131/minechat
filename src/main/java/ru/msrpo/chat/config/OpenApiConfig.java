package ru.msrpo.chat.config;

import io.swagger.v3.oas.models.*;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.*;
import org.springframework.context.annotation.*;

@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {
    @Bean OpenAPI openAPI() {
        return new OpenAPI().info(new Info().title("MSRPO Chat API").version("v1")
                .description("Личные диалоги, сообщения и закрытые вложения. События: GET /api/v1/events."))
            .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
            .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}
