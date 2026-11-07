package ru.msrpo.chat.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import static org.assertj.core.api.Assertions.assertThat;

class JwtPropertiesTest {
    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JwtProperties.class)
    static class TestConfig {}
    private final ApplicationContextRunner context = new ApplicationContextRunner()
        .withUserConfiguration(TestConfig.class).withBean(LocalValidatorFactoryBean.class)
        .withPropertyValues("app.jwt.issuer=msrpo-chat");
    @Test void bindsDurationAndRedactsSecret() {
        context.withPropertyValues("app.jwt.secret=secret-value", "app.jwt.access-ttl=30m").run(result -> {
            assertThat(result).hasNotFailed();
            assertThat(result.getBean(JwtProperties.class).accessTtl()).hasMinutes(30);
            assertThat(result.getBean(JwtProperties.class).toString()).doesNotContain("secret-value");
        });
    }
    @Test void rejectsMissingSecretAndNonPositiveDuration() {
        context.withPropertyValues("app.jwt.access-ttl=30m").run(result -> assertThat(result).hasFailed());
        context.withPropertyValues("app.jwt.secret=x", "app.jwt.access-ttl=0s").run(result -> assertThat(result).hasFailed());
        context.withPropertyValues("app.jwt.secret=x", "app.jwt.access-ttl=-1s").run(result -> assertThat(result).hasFailed());
    }
}
