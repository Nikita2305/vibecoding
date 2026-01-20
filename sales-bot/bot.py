#!/usr/bin/env python3
"""
Telegram бот для Insighteer.
Обрабатывает сообщения пользователей и пересылает их менеджеру.
"""

import os
import logging
import random
from zoneinfo import ZoneInfo
from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Получение переменных окружения
BOT_TOKEN = os.getenv('BOT_TOKEN')
ADMIN_CHAT_ID = os.getenv('ADMIN_CHAT_ID')

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не установлен в переменных окружения")
if not ADMIN_CHAT_ID:
    raise ValueError("ADMIN_CHAT_ID не установлен в переменных окружения")

# Преобразуем ADMIN_CHAT_ID в int для сравнения
ADMIN_CHAT_ID_INT = int(ADMIN_CHAT_ID)

# Инициализация бота и диспетчера
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

# Словарь для хранения соответствия между сообщениями админу и ID пользователей
# Ключ: message_id сообщения в админском чате, Значение: user_id пользователя
user_message_map = {}

# Словарь для хранения соответствия между сообщениями "Ответить" и ID пользователей
# Ключ: message_id сообщения "Ответить" в админском чате, Значение: user_id пользователя
reply_message_map = {}


def create_reply_button(user_id: int) -> InlineKeyboardMarkup:
    """Создает клавиатуру с кнопкой 'Ответить'"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Ответить", callback_data=f"reply_{user_id}")]
    ])
    return keyboard

# Список мотивирующих фраз
MOTIVATIONAL_PHRASES = [
    "Сегодня отличный день для новых достижений! 💪",
    "Каждый день - это новая возможность стать лучше! 🌟",
    "Верь в себя, и у тебя всё получится! ✨",
    "Твоя целеустремленность приведет к успеху! 🚀",
    "Сегодня ты сделаешь что-то великое! 💎",
    "Не останавливайся на достигнутом - впереди еще больше! 🎯",
    "Твоя энергия и энтузиазм вдохновляют! 🔥",
    "Каждый шаг приближает тебя к цели! 👣",
    "Сегодня ты станешь лучше, чем вчера! 📈",
    "Твоя настойчивость - ключ к успеху! 🔑",
    "Верь в свои силы - они безграничны! 💫",
    "Сегодня день, когда мечты становятся реальностью! 🌈",
    "Твоя страсть к делу создает чудеса! ⚡",
    "Каждая проблема - это возможность для роста! 🌱",
    "Сегодня ты покоришь новые вершины! ⛰️",
    "Твоя решимость меняет мир к лучшему! 🌍",
    "Не сдавайся - успех уже близко! 🎉",
    "Сегодня ты проявишь себя во всей красе! 🌺",
    "Твоя уверенность - твоя суперсила! 🦸",
    "Каждый день - это шанс стать легендой! 🏆"
]


@dp.message(Command("start"))
async def cmd_start(message: Message):
    """Обработчик команды /start"""
    welcome_text = (
        "Привет! 👋\n\n"
        "Insighteer позволяет тестировать маркетинговые креативы и стратегии.\n\n"
        "Можете задать любой вопрос, и мы вам обязательно ответим 👌"
    )
    await message.answer(welcome_text)
    
    # Отправляем информацию о пользователе в админский чат
    try:
        user_id = message.from_user.id
        user_name = message.from_user.full_name or "Не указано"
        username = message.from_user.username
        
        # Формируем ссылку на профиль
        if username:
            profile_link = f"https://t.me/{username}"
        else:
            profile_link = f"tg://user?id={user_id}"
        
        # Отправляем сообщение админу
        admin_message = (
            f"<b>Пользователь нажал /start</b>\n\n"
            f"<b>Данные пользователя:</b>\n"
            f"ID: {user_id}\n"
            f"Имя: {user_name}\n"
            f"Профиль: <a href=\"{profile_link}\">t.me/{username if username else f'user?id={user_id}'}</a>"
        )
        
        sent_message = await bot.send_message(
            chat_id=ADMIN_CHAT_ID_INT,
            text=admin_message,
            parse_mode=ParseMode.HTML,
            reply_markup=create_reply_button(user_id)
        )
        
        # Сохраняем соответствие для возможных ответов
        user_message_map[sent_message.message_id] = user_id
        
    except Exception as e:
        logger.error(f"Ошибка при отправке информации о /start в админский чат: {e}", exc_info=True)


@dp.callback_query(lambda c: c.data.startswith("reply_"))
async def handle_reply_button(callback: CallbackQuery):
    """Обработчик нажатия на кнопку 'Ответить'"""
    try:
        # Извлекаем ID пользователя из callback_data
        user_id = int(callback.data.split("_")[1])
        
        # Отправляем сообщение "Ответить пользователю" в админский чат
        reply_message = await bot.send_message(
            chat_id=ADMIN_CHAT_ID_INT,
            text="<b>Ответ пользователю:</b>\n\nОтветьте на это сообщение, чтобы отправить ответ пользователю.",
            parse_mode=ParseMode.HTML
        )
        
        # Сохраняем соответствие между сообщением "Ответить" и ID пользователя
        reply_message_map[reply_message.message_id] = user_id
        
        await callback.answer("Теперь ответьте на сообщение выше, чтобы отправить ответ пользователю")
        
    except Exception as e:
        logger.error(f"Ошибка при обработке кнопки 'Ответить': {e}", exc_info=True)
        await callback.answer("Произошла ошибка. Попробуйте позже.", show_alert=True)


@dp.message(lambda m: m.chat.id == ADMIN_CHAT_ID_INT and m.reply_to_message)
async def handle_admin_reply(message: Message):
    """Обработчик ответов админа на сообщения 'Ответить пользователю'"""
    try:
        # Получаем ID сообщения, на которое ответил админ
        replied_message_id = message.reply_to_message.message_id
        
        # Ищем ID пользователя по ID сообщения "Ответить"
        user_id = reply_message_map.get(replied_message_id)
        
        if not user_id:
            # Если не найдено в reply_message_map, возможно это старый формат
            return
        
        # Отправляем ответ пользователю
        reply_text = message.text or message.caption or "[Медиа-файл]"
        
        if message.photo:
            await bot.send_photo(
                chat_id=user_id,
                photo=message.photo[-1].file_id,
                caption=reply_text
            )
        elif message.video:
            await bot.send_video(
                chat_id=user_id,
                video=message.video.file_id,
                caption=reply_text
            )
        elif message.document:
            await bot.send_document(
                chat_id=user_id,
                document=message.document.file_id,
                caption=reply_text
            )
        else:
            await bot.send_message(
                chat_id=user_id,
                text=reply_text
            )
        
        await message.answer("✅ Ответ отправлен пользователю")
        
    except Exception as e:
        logger.error(f"Ошибка при отправке ответа пользователю: {e}", exc_info=True)
        await message.answer("Произошла ошибка при отправке ответа пользователю.")


@dp.message()
async def handle_message(message: Message):
    """Обработчик всех сообщений от пользователей"""
    try:
        # Получаем данные пользователя
        user_id = message.from_user.id
        user_name = message.from_user.full_name or "Не указано"
        username = message.from_user.username
        
        # Формируем ссылку на профиль
        if username:
            profile_link = f"https://t.me/{username}"
        else:
            profile_link = f"tg://user?id={user_id}"
        
        # Копируем сообщение пользователя в админский чат
        user_message_text = message.text or message.caption or "[Медиа-файл]"
        
        # Отправляем сообщение админу
        admin_message = (
            f"<b>Сообщение от пользователя:</b>\n\n"
            f"{user_message_text}\n\n"
            f"<b>Данные пользователя:</b>\n"
            f"ID: {user_id}\n"
            f"Имя: {user_name}\n"
            f"Профиль: <a href=\"{profile_link}\">t.me/{username if username else f'user?id={user_id}'}</a>"
        )
        
        # Если это медиа-файл, отправляем его с подписью
        if message.photo:
            sent_message = await bot.send_photo(
                chat_id=ADMIN_CHAT_ID_INT,
                photo=message.photo[-1].file_id,
                caption=admin_message,
                parse_mode=ParseMode.HTML,
                reply_markup=create_reply_button(user_id)
            )
            user_message_map[sent_message.message_id] = user_id
        elif message.video:
            sent_message = await bot.send_video(
                chat_id=ADMIN_CHAT_ID_INT,
                video=message.video.file_id,
                caption=admin_message,
                parse_mode=ParseMode.HTML,
                reply_markup=create_reply_button(user_id)
            )
            user_message_map[sent_message.message_id] = user_id
        elif message.document:
            sent_message = await bot.send_document(
                chat_id=ADMIN_CHAT_ID_INT,
                document=message.document.file_id,
                caption=admin_message,
                parse_mode=ParseMode.HTML,
                reply_markup=create_reply_button(user_id)
            )
            user_message_map[sent_message.message_id] = user_id
        else:
            # Отправляем текстовое сообщение админу
            sent_message = await bot.send_message(
                chat_id=ADMIN_CHAT_ID_INT,
                text=admin_message,
                parse_mode=ParseMode.HTML,
                reply_markup=create_reply_button(user_id)
            )
            # Сохраняем соответствие между сообщением админу и ID пользователя
            user_message_map[sent_message.message_id] = user_id
        
        # Подтверждаем пользователю, что сообщение получено
        await message.answer("Ваше сообщение отправлено, мы вскоре вам ответим ☺️")
        
    except Exception as e:
        logger.error(f"Ошибка при обработке сообщения: {e}", exc_info=True)
        await message.answer("Произошла ошибка при отправке сообщения. Попробуйте позже.")


async def send_daily_motivation():
    """Отправляет случайную мотивирующую фразу в админский чат"""
    try:
        phrase = random.choice(MOTIVATIONAL_PHRASES)
        message_text = f"<b>Мотивация на день:</b>\n\n{phrase}"
        await bot.send_message(
            chat_id=ADMIN_CHAT_ID_INT,
            text=message_text,
            parse_mode=ParseMode.HTML
        )
        logger.info("Мотивирующая фраза отправлена в админский чат")
    except Exception as e:
        logger.error(f"Ошибка при отправке мотивирующей фразы: {e}", exc_info=True)


async def main():
    """Главная функция запуска бота"""
    logger.info("Запуск бота...")
    
    # Настройка планировщика для ежедневной отправки мотивации в 9:00 МСК
    moscow_tz = ZoneInfo("Europe/Moscow")
    scheduler = AsyncIOScheduler(timezone=moscow_tz)
    scheduler.add_job(
        send_daily_motivation,
        trigger=CronTrigger(hour=8, minute=40, timezone=moscow_tz),  # Каждый день в 9:00 МСК
        id='daily_motivation',
        name='Ежедневная мотивация',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Планировщик запущен. Мотивация будет отправляться каждый день в 9:00 МСК")
    
    try:
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Ошибка при запуске бота: {e}", exc_info=True)
    finally:
        scheduler.shutdown()
        await bot.session.close()


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
