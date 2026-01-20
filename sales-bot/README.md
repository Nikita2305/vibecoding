# Sales Bot

## Локальный запуск

1. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```

2. Настройте переменные окружения в файле `.env`:
   ```env
   BOT_TOKEN=ваш_токен_бота
   ADMIN_CHAT_ID=ваш_chat_id
   ```

3. Запустите бота:
   ```bash
   export $(cat .env | xargs) && python bot.py
   ```

## Запуск в Production

1. Настройте переменные окружения в файле `.env`:
   ```env
   BOT_TOKEN=ваш_токен_бота
   ADMIN_CHAT_ID=ваш_chat_id
   ```

2. Запустите через Docker Compose:
   ```bash
   docker-compose up -d
   ```

3. Просмотр логов:
   ```bash
   docker-compose logs -f
   ```
