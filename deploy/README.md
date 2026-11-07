# Ручной деплой в Yandex Cloud

Одна Ubuntu 24.04 VM, x86-64, минимум 4 ГБ RAM. Java, React, PostgreSQL и Elasticsearch 9.2.8 остаются в проекте. Это одно окружение. GitHub Actions обновляет его после push в `master`; первичная установка описана ниже.

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

При настроенном GitHub Actions обычного push в `master` достаточно для обновления сервера. Ручное обновление на VM также возможно: `git pull --ff-only`, затем `sudo sh deploy/deploy.sh`.

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

## Автоматическое обновление из GitHub

Workflow `.github/workflows/deploy.yml` запускается на push в `master` и вручную через GitHub → Actions. Изменения в других ветках сервер не обновляют. Повторные деплои выполняются последовательно; автоматическая сборка и запуск занимают несколько минут, обновление не мгновенное.

GitHub хранит `DEPLOY_SSH_KEY` и `DEPLOY_KNOWN_HOSTS` в Actions Secrets. Это отдельный ключ деплоя, не личный SSH-ключ администратора. Его запись в `authorized_keys` разрешает только forced-command `/usr/local/bin/minechat-deploy`; интерактивный shell и перенаправление портов запрещены. Скрипт проверяет формат commit SHA и его принадлежность ветке `master`, обновляет код fast-forward и запускает существующий `deploy/deploy.sh` с серверной сборкой образов.

Для первичной установки нужен публичный ключ GitHub Actions в файле на VM:

```sh
sudo sh deploy/install-ci.sh /path/to/actions-key.pub
```

Приватный ключ передавайте только в GitHub Actions Secret `DEPLOY_SSH_KEY`, не в Git и не в сообщения. В `DEPLOY_KNOWN_HOSTS` должна быть заранее проверенная запись SSH host key сервера; получение через `ssh-keyscan` без сверки не заменяет проверку подлинности.

`.env.prod` и постоянные тома PostgreSQL, Elasticsearch и Caddy сохраняются. Контейнеры приложения могут ненадолго перезапуститься. Автоматического отката миграций базы нет; перед изменениями схемы делайте резервные копии. Участники с правом push в `master` должны считаться доверенными: код этой ветки исполняется на сервере.

Результат конкретного обновления смотрите в GitHub → Actions → Deploy Minechat. Зелёный статус означает, что команда деплоя завершилась успешно и backend ответил на проверочный запрос. При красном статусе проверьте лог; не удаляйте тома для исправления ошибки.

## Источники

- Docker: https://docs.docker.com/engine/install/ubuntu/
- Elasticsearch: https://www.elastic.co/docs/deploy-manage/deploy/self-managed/vm-max-map-count

Запуск на конкретной VM и внешний доступ подтверждаются только после выполнения команд на сервере. Наличие файлов деплоя само по себе этого не подтверждает.
