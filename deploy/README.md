# Ручной деплой в Yandex Cloud

Одна Ubuntu 24.04 VM, x86-64, минимум 4 ГБ RAM. Java, React, PostgreSQL и Elasticsearch 9.2.8 остаются в проекте. Это одно окружение; автоматический деплой GitHub Actions пока не подключён.

## 1. Подключение и сеть

В группе безопасности VM разрешите входящие TCP 80 и 443 из интернета, TCP 22 со своего внешнего IP /32. Исходящие подключения нужны для загрузки образов и сертификатов. PostgreSQL, Elasticsearch и backend в серверном Compose не публикуются наружу.

В PowerShell замените `PUBLIC_IP` реальным публичным IP, `marik` — выбранным SSH-логином:

```powershell
ssh marik@PUBLIC_IP
```

При первом подключении сравните SSH fingerprint сервера с полученным через доверенный канал, например консоль Yandex. Приватный SSH-ключ остаётся на компьютере.

## 2. Передача проекта без GitHub

Если исходники уже опубликованы в `https://github.com/Maratus131/minechat`, вместо архива на VM можно выполнить:

```sh
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Maratus131/minechat.git ~/minechat
cd ~/minechat
sudo sh deploy/setup-server.sh
sh deploy/init-env.sh http://PUBLIC_IP
sudo sh deploy/deploy.sh
```

Пустой репозиторий сначала нужно наполнить кодом, включая `compose.prod.yaml`, `deploy/`, `frontend/Dockerfile.prod` и `frontend/Caddyfile`. Для приватного репозитория используйте настроенный SSH deploy key или передачу архивом; не вставляйте GitHub-токен в URL.

Дальнейшее обновление через GitHub на VM: `git pull --ff-only`, затем `sudo sh deploy/deploy.sh`. Публикация кода сама по себе пока не запускает серверное обновление.

В PowerShell из корня проекта создайте архив исходников. Локальные `.env`, зависимости и сборки не передаются:

```powershell
tar --exclude=node_modules --exclude=dist --exclude=.env --exclude='.env.*' --exclude=.git -czf minechat-deploy.tar.gz Dockerfile pom.xml src frontend compose.prod.yaml deploy
scp minechat-deploy.tar.gz marik@PUBLIC_IP:~/
```

Архив содержит исходный код. Не публикуйте его в открытом доступе, если репозиторий приватный.

## 3. Подготовка VM

Следующие команды выполняются в SSH на сервере:

```sh
mkdir -p ~/minechat
tar -xzf ~/minechat-deploy.tar.gz -C ~/minechat
cd ~/minechat
sudo sh deploy/setup-server.sh
sh deploy/init-env.sh http://PUBLIC_IP
```

`setup-server.sh` устанавливает Docker из официального apt-репозитория и настраивает `vm.max_map_count` для Elasticsearch. Он рассчитан на чистую Ubuntu без конфликтующих установок Docker.

`init-env.sh` создаёт отдельный `.env.prod` со случайными паролем PostgreSQL и JWT-ключом; существующий файл не перезаписывает. Не загружайте `.env.prod` в GitHub и не меняйте пароль БД после первого запуска без изменения пароля в самой PostgreSQL.

## 4. Первый запуск

```sh
sudo sh deploy/deploy.sh
```

Сборка выполняется на VM и требует дополнительного дискового места. На диске 20 ГБ перед запуском проверьте `df -h /`: при нехватке места потребуется увеличить диск либо собирать и передавать готовые образы с компьютера/CI. После успешной сборки можно очистить только build cache командой `sudo docker builder prune`; не удаляйте рабочие тома.

Диагностика:

```sh
sudo docker compose -p minechat-prod --env-file .env.prod -f compose.prod.yaml ps
sudo docker compose -p minechat-prod --env-file .env.prod -f compose.prod.yaml logs --tail=100 backend web elasticsearch
curl -I http://PUBLIC_IP/
curl -i http://PUBLIC_IP/api/v1/users/me
```

Ожидаются сайт и `401` на `/users/me` без токена. Затем проверьте регистрацию, вход, сообщения между двумя устройствами, поиск и загрузку файла.

## 5. HTTPS и приложения

Первый запуск по `http://PUBLIC_IP` годится для проверки. Для удалённого Electron, записи голоса в браузере и безопасной передачи паролей нужен HTTPS. При наличии домена направьте его DNS A-запись на IP VM и измените в `.env.prod`:

```dotenv
SITE_ADDRESS=chat.example.ru
CORS_ORIGINS=https://chat.example.ru
```

Затем снова выполните `sudo sh deploy/deploy.sh`. Порты 80/443 должны быть доступны; Caddy автоматически получает сертификат. Данные Caddy сохраняются в томе.

В мобильном клиенте: `EXPO_PUBLIC_API_URL=https://chat.example.ru/api/v1`. В Electron: `MSRPO_BACKEND_URL=https://chat.example.ru`. Перезапустите Metro/приложение после изменения адреса.

## 6. Обновление и сохранение данных

Перед обновлением сделайте копию PostgreSQL:

```sh
mkdir -p ~/minechat-backups
chmod 700 ~/minechat-backups
umask 077
sudo docker compose -p minechat-prod --env-file .env.prod -f compose.prod.yaml exec -T postgres pg_dump -U chat -d chat -Fc > ~/minechat-backups/chat-$(date +%Y%m%d-%H%M%S).dump
```

Скопируйте резервную копию за пределы VM. Вложения и аватары хранятся в PostgreSQL и входят в дамп. Индекс Elasticsearch хранится отдельно в томе; его восстановление не заменяется одним дампом PostgreSQL.

Передайте новый архив, распакуйте его в ту же папку и повторите `sudo sh deploy/deploy.sh`. `.env.prod` и тома при обычном обновлении сохраняются. Не выполняйте `docker compose down -v`: это удаляет данные.

## Основания и проверка

- Docker: https://docs.docker.com/engine/install/ubuntu/
- Elasticsearch: https://www.elastic.co/docs/deploy-manage/deploy/self-managed/vm-max-map-count

Запуск на конкретной VM и внешний доступ подтверждаются только после выполнения команд на сервере. Наличие файлов деплоя само по себе этого не подтверждает.
