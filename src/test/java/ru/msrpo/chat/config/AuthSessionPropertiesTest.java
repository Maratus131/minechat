package ru.msrpo.chat.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import ru.msrpo.chat.auth.SessionCookie;
import java.time.Duration;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class AuthSessionPropertiesTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Config.class)
        .withBean(LocalValidatorFactoryBean.class);
    @Configuration(proxyBeanMethods = false) @EnableConfigurationProperties(AuthSessionProperties.class)
    static class Config {}

    @Test void bindsDurationAndUsesSecureCookiesUnlessExplicitlyDisabledForLocalDevelopment() {
        runner.withPropertyValues("app.auth.session-ttl=30d", "app.auth.cookie-secure=${AUTH_COOKIE_SECURE:true}").run(context -> {
            assertThat(context).hasNotFailed(); var properties = context.getBean(AuthSessionProperties.class);
            assertThat(properties.sessionTtl()).isEqualTo(Duration.ofDays(30));
            assertThat(new SessionCookie(properties).create("token")).contains("Secure", "HttpOnly", "SameSite=Strict");
        });
        runner.withInitializer(context -> context.getEnvironment().getPropertySources().addFirst(
            new SystemEnvironmentPropertySource("test-env", Map.of("AUTH_COOKIE_SECURE", "false"))))
            .withPropertyValues("app.auth.session-ttl=30d", "app.auth.cookie-secure=${AUTH_COOKIE_SECURE:true}").run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(new SessionCookie(context.getBean(AuthSessionProperties.class)).create("token")).doesNotContain("Secure");
            });
    }

    @Test void rejectsMissingNonPositiveAndExcessivelyLongSessionLifetime() {
        runner.run(context -> assertThat(context).hasFailed());
        for (String lifetime : new String[] { "0s", "-1s", "91d" })
            runner.withPropertyValues("app.auth.session-ttl=" + lifetime).run(context -> assertThat(context).hasFailed());
    }
}
