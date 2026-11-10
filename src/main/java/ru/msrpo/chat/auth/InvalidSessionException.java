package ru.msrpo.chat.auth;

import org.springframework.http.HttpStatus;
import ru.msrpo.chat.common.ApiException;

public class InvalidSessionException extends ApiException {
    public InvalidSessionException() { super(HttpStatus.UNAUTHORIZED, "Сеанс завершён. Войдите снова."); }
}
