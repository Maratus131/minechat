# Нагрузочный тест

Тест запускает 100 пользователей одновременно. У каждого свой аккаунт и WebSocket-соединение. Пользователи разбиваются на пары, отправляют сообщения и читают историю. Скрипт проверяет, что сообщение пришло собеседнику и не попало постороннему пользователю.

Результаты контрольного запуска: [RESULTS.md](RESULTS.md).

Нужны Docker Desktop и Node.js 24. Дополнительные npm-пакеты не нужны. Используется отдельная база, отдельные Docker volumes и порт `18080`. Рабочий сайт тест не затрагивает. Скрипт запрещает публичные адреса.

Из корня проекта:

```powershell
node loadtests/init.mjs
docker compose -p minechat-loadtest --env-file loadtests/.env -f compose.load.yaml up -d --build
docker compose -p minechat-loadtest --env-file loadtests/.env -f compose.load.yaml --profile test run --rm loadtest
```

Первый запуск дольше: Docker собирает backend, а тест создаёт аккаунты. Сам обмен сообщениями длится 60 секунд. Отчёт сохраняется в `target/load-results/latest.json`. Пароли и токены в отчёт не записываются.

Для другого количества пользователей и длительности:

```powershell
$env:LOAD_USERS = '200'
$env:LOAD_DURATION_SEC = '120'
$env:LOAD_MESSAGE_INTERVAL_MS = '5000'
docker compose -p minechat-loadtest --env-file loadtests/.env -f compose.load.yaml --profile test run --rm loadtest
```

Количество пользователей должно быть чётным: от 2 до 1000. Интервал означает паузу после отправки и чтения истории, а не гарантированное число запросов в секунду. Это тест с постоянным числом подключённых пользователей.

Если Node уже установлен, скрипт можно выполнить без контейнера теста, после запуска отдельного backend:

```powershell
$env:USERS = '100'
$env:DURATION_SEC = '60'
node loadtests/run.mjs
```

## Что считается успешным

- Не больше 1% неуспешных HTTP-запросов во время обмена сообщениями
- 95% HTTP-запросов выполняются не дольше 2 секунд
- Не меньше 99% принятых сервером сообщений доходят собеседнику
- 95% сообщений доставляются через WebSocket не дольше 2 секунд от начала отправки
- Нет разрывов WebSocket, некорректных событий и сообщений в чужих переписках

Регистрация и вход идут до основной нагрузки. Их время находится отдельно в `setupHttp`; обмен сообщениями — в `workloadHttp`. Показатели зависят от компьютера, Docker и количества пользователей. Выходной код `0` означает, что все проверки прошли, `1` — есть ошибки или превышения, `130` — тест остановлен.

Пороги можно изменить переменными `MAX_HTTP_ERROR_RATE`, `MAX_HTTP_P95_MS`, `MAX_DELIVERY_P95_MS`, `MIN_DELIVERY_RATE` при прямом запуске Node. Эти значения описывают условия теста, а не обещанную производительность приложения.

## После теста

Остановить только нагрузочный стенд, сохранив данные:

```powershell
docker compose -p minechat-loadtest --env-file loadtests/.env -f compose.load.yaml down
```

Удалить тестовых пользователей и сообщения вместе с volumes **только этого стенда**:

```powershell
docker compose -p minechat-loadtest --env-file loadtests/.env -f compose.load.yaml down -v
```

Проект называется `minechat-loadtest`. Обычные контейнеры и данные `msrpo-chat` и `minechat-prod` эти команды не удаляют.
