# Minechat

Учебный чат в стиле Minecraft. Сделал три версии: сайт, приложение для компьютера и приложение для телефона. У них общий сервер и общие аккаунты.

**Автор: Усачёв Марат Александрович.**

[Открыть сайт](https://84.201.180.177.sslip.io) · [Репозиторий](https://github.com/Maratus131/minechat)

## Что есть

- Регистрация и вход по логину и паролю
- Личные переписки, групповые чаты и каналы
- Роли участников и удаление сообщений с учётом прав
- Редактирование своих сообщений и подписей. Действия открываются правой кнопкой мыши или долгим нажатием на телефоне
- Отправка файлов, фотографий, видео и голосовых сообщений
- Поиск людей, каналов и сообщений через Elasticsearch
- Профиль: имя, аватар и дата рождения. Дату рождения видит только владелец
- Статус «В сети» в личных чатах

После перезапуска приложения нужно войти снова. Фото и видео показываются внутри переписки без названий файлов.

## На чём сделано

Сервер — Java 21 и Spring Boot. Сайт — React и TypeScript, десктоп — Electron, мобильное приложение — React Native и Expo. Данные хранятся в PostgreSQL, для поиска используется Elasticsearch. Новые сообщения приходят через WebSocket, отправка сообщений и файлов идёт через REST API.

## Запуск на компьютере

Нужны Docker Desktop, Node.js 24 и pnpm. Для запуска серверных тестов ещё нужен JDK 21.

Сначала запустить сервер и базы из корня проекта в PowerShell:

```powershell
.\scripts\init-env.ps1
docker compose up -d --build
```

Затем в другом терминале запустить сайт:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Сайт откроется на http://localhost:5173, API — на http://localhost:8080/api/v1. Описание API доступно в [Swagger](http://localhost:8080/swagger-ui/index.html).

Файлы `.env` с настройками не нужно загружать в GitHub.

### Десктоп

После установки зависимостей сайта выполнить из корня проекта:

```powershell
cd desktop
pnpm install --frozen-lockfile
pnpm dev
```

В `desktop/.env` адрес сервера задаётся без `/api/v1`:

```env
MSRPO_BACKEND_URL=https://84.201.180.177.sslip.io
```

### Телефон

В `mobile/.env` нужен полный адрес API:

```env
EXPO_PUBLIC_API_URL=https://84.201.180.177.sslip.io/api/v1
```

Из корня проекта:

```powershell
cd mobile
pnpm install --frozen-lockfile
pnpm exec expo start --go --lan --clear
```

На телефоне открыть Expo Go для SDK 55 и отсканировать QR-код. Телефон и компьютер должны быть в одной Wi-Fi сети. Для такого запуска эмулятор не нужен.

Подробности: [веб](frontend/README.md), [десктоп](desktop/README.md), [мобильное приложение](mobile/README.md).

## Тесты

Серверные автотесты:

```powershell
.\mvnw.cmd test
```

Тесты с настоящими PostgreSQL и Elasticsearch, для которых нужен Docker:

```powershell
.\mvnw.cmd verify -Pintegration
```

Веб-проверки запускаются из `frontend`: `pnpm test`, `pnpm typecheck`, `pnpm lint` и `pnpm build`. Тесты проверяют обработку событий WebSocket, восстановление истории и закрытие соединения. Из `desktop` можно запустить `pnpm test` для проверки прокси и настроек соединения. Для мобильного приложения из `mobile`: `pnpm typecheck`.

Нагрузочные сценарии и команды запуска находятся в [loadtests/README.md](loadtests/README.md). Для HTTP-нагрузки на сервер используется Apache JMeter. Отдельный сценарий Node.js проверяет доставку через WebSocket. Результаты локального прогона записаны в [loadtests/RESULTS.md](loadtests/RESULTS.md); производительность облачного сервера ими не подтверждается.

## Docker и сервер

В `compose.yaml` находятся сервер, PostgreSQL и Elasticsearch для локальной разработки. В `compose.prod.yaml` добавлен сайт с Caddy и HTTPS. Десктопное приложение и Expo Go запускаются на своих устройствах.

Проект размещён на виртуальной машине в Yandex Cloud. После push в `master` GitHub Actions автоматически обновляет сервер. Инструкция развёртывания — в [deploy/README.md](deploy/README.md).
