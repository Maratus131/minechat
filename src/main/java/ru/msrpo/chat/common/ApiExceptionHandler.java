package ru.msrpo.chat.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException error) {
        var response = ResponseEntity.status(error.status());
        if (error.status() == HttpStatus.UNAUTHORIZED) response.header(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        return response.body(ProblemDetail.forStatusAndDetail(error.status(), error.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception error, WebRequest request) {
        log.error("Request failed", error);
        return handleExceptionInternal(error, ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "Внутренняя ошибка сервера"),
            new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }
}
