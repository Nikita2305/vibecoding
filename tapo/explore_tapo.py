#!/usr/bin/env python3
"""
Скрипт для изучения возможностей библиотеки pytapo.
Демонстрирует управление камерой Tapo: движение, пресеты, круиз-режим и другие функции.
"""

import os
import time
from pathlib import Path
from pytapo import Tapo


def load_env_file(env_path=".env"):
    """Загрузить переменные из .env файла."""
    env_vars = {}
    env_file = Path(env_path)
    
    if not env_file.exists():
        return env_vars
    
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # Пропускаем пустые строки и комментарии
                if not line or line.startswith("#"):
                    continue
                # Разбираем KEY=VALUE
                if "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip()
                    # Убираем кавычки если есть
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    env_vars[key] = value
    except Exception as e:
        print(f"⚠ Предупреждение: не удалось прочитать .env файл: {e}")
    
    return env_vars


class TapoExplorer:
    """Класс для изучения возможностей камеры Tapo."""

    def __init__(self, host, user, password):
        """Инициализация подключения к камере."""
        print(f"Подключение к камере {host}...")
        self.cam = Tapo(host=host, user=user, password=password)
        print("✓ Подключение установлено\n")
        self._check_privacy_mode()

    def _check_privacy_mode(self):
        """Проверка и предупреждение о режиме приватности."""
        try:
            privacy = self.cam.getPrivacyMode()
            if privacy.get("enabled") == "on":
                print("⚠ ВНИМАНИЕ: Режим приватности включен. Движение камеры может быть ограничено.")
                print("   Используйте опцию меню для отключения режима приватности.\n")
        except Exception:
            pass

    def show_basic_info(self):
        """Показать базовую информацию о камере."""
        print("\n=== Базовая информация о камере ===")
        try:
            info = self.cam.getBasicInfo()
            print(f"Модель: {info.get('device_info', {}).get('model', 'N/A')}")
            print(f"Версия прошивки: {info.get('device_info', {}).get('fw_ver', 'N/A')}")
            print(f"Серийный номер: {info.get('device_info', {}).get('device_id', 'N/A')}")
        except Exception as e:
            print(f"Ошибка при получении информации: {e}")

    def show_motor_capability(self):
        """Показать возможности мотора камеры."""
        print("\n=== Возможности мотора ===")
        try:
            capability = self.cam.getMotorCapability()
            print(f"Возможности: {capability}")
        except Exception as e:
            print(f"Ошибка при получении возможностей мотора: {e}")

    def move_basic_directions(self):
        """Демонстрация базовых направлений движения."""
        print("\n=== Базовые направления движения ===")
        print("Выберите направление:")
        print("1. Влево (против часовой стрелки)")
        print("2. Вправо (по часовой стрелке)")
        print("3. Вверх (вертикально)")
        print("4. Вниз (горизонтально)")
        print("5. Вернуться в меню")

        choice = input("\nВаш выбор: ").strip()

        movements = {
            "1": ("Влево", self.cam.moveMotorCounterClockWise),
            "2": ("Вправо", self.cam.moveMotorClockWise),
            "3": ("Вверх", self.cam.moveMotorVertical),
            "4": ("Вниз", self.cam.moveMotorHorizontal),
        }

        if choice in movements:
            name, func = movements[choice]
            print(f"\nДвижение: {name}...")
            try:
                result = func()
                if result.get("error_code") == 0:
                    print(f"✓ Камера успешно повернулась {name.lower()}")
                    time.sleep(2)
                else:
                    print(f"✗ Ошибка: {result}")
            except Exception as e:
                print(f"✗ Ошибка при движении: {e}")
        elif choice != "5":
            print("Неверный выбор")

    def move_by_coordinates(self):
        """Движение камеры по координатам."""
        print("\n=== Движение по координатам ===")
        print("Введите координаты x и y (обычно от -1 до 1, где 0 - центр)")
        print("Примеры:")
        print("  x=0, y=0 - центр")
        print("  x=1, y=0 - вправо")
        print("  x=-1, y=0 - влево")
        print("  x=0, y=1 - вверх")
        print("  x=0, y=-1 - вниз")

        try:
            x = float(input("Координата X: ").strip())
            y = float(input("Координата Y: ").strip())
            print(f"\nДвижение к координатам ({x}, {y})...")
            result = self.cam.moveMotor(x, y)
            if result.get("error_code") == 0:
                print("✓ Камера успешно переместилась")
            else:
                print(f"✗ Ошибка: {result}")
        except ValueError:
            print("✗ Ошибка: введите числовые значения")
        except Exception as e:
            print(f"✗ Ошибка при движении: {e}")

    def move_by_angle(self):
        """Движение камеры по углу."""
        print("\n=== Движение по углу ===")
        print("Введите угол в градусах (0-359):")
        print("  0° - по часовой стрелке (вправо)")
        print("  90° - вертикально (вверх)")
        print("  180° - против часовой стрелки (влево)")
        print("  270° - горизонтально (вниз)")

        try:
            angle = int(input("Угол (0-359): ").strip())
            if not (0 <= angle < 360):
                print("✗ Ошибка: угол должен быть в диапазоне 0-359")
                return

            print(f"\nДвижение под углом {angle}°...")
            result = self.cam.moveMotorStep(angle)
            if result.get("error_code") == 0:
                print(f"✓ Камера успешно повернулась под углом {angle}°")
            else:
                print(f"✗ Ошибка: {result}")
        except ValueError:
            print("✗ Ошибка: введите целое число")
        except Exception as e:
            print(f"✗ Ошибка при движении: {e}")

    def manage_presets(self):
        """Управление пресетами камеры."""
        print("\n=== Управление пресетами ===")
        print("1. Показать список пресетов")
        print("2. Сохранить текущую позицию как пресет")
        print("3. Перейти к пресету")
        print("4. Удалить пресет")
        print("5. Вернуться в меню")

        choice = input("\nВаш выбор: ").strip()

        if choice == "1":
            self._show_presets()
        elif choice == "2":
            self._save_preset()
        elif choice == "3":
            self._goto_preset()
        elif choice == "4":
            self._delete_preset()
        elif choice != "5":
            print("Неверный выбор")

    def _show_presets(self):
        """Показать список пресетов."""
        try:
            presets = self.cam.getPresets()
            if presets:
                print("\nСписок пресетов:")
                for preset_id, name in presets.items():
                    print(f"  ID: {preset_id}, Имя: {name}")
            else:
                print("\nПресеты не найдены")
        except Exception as e:
            print(f"✗ Ошибка при получении пресетов: {e}")

    def _save_preset(self):
        """Сохранить текущую позицию как пресет."""
        try:
            name = input("Введите имя пресета: ").strip()
            if not name:
                print("✗ Ошибка: имя не может быть пустым")
                return
            self.cam.savePreset(name)
            print(f"✓ Пресет '{name}' успешно сохранен")
        except Exception as e:
            print(f"✗ Ошибка при сохранении пресета: {e}")

    def _goto_preset(self):
        """Перейти к пресету."""
        try:
            self._show_presets()
            preset_id = input("\nВведите ID пресета: ").strip()
            print(f"Переход к пресету {preset_id}...")
            result = self.cam.setPreset(preset_id)
            if result.get("error_code") == 0:
                print(f"✓ Камера успешно переместилась к пресету {preset_id}")
            else:
                print(f"✗ Ошибка: {result}")
        except Exception as e:
            print(f"✗ Ошибка при переходе к пресету: {e}")

    def _delete_preset(self):
        """Удалить пресет."""
        try:
            self._show_presets()
            preset_id = input("\nВведите ID пресета для удаления: ").strip()
            self.cam.deletePreset(preset_id)
            print(f"✓ Пресет {preset_id} успешно удален")
        except Exception as e:
            print(f"✗ Ошибка при удалении пресета: {e}")

    def manage_cruise(self):
        """Управление круиз-режимом."""
        print("\n=== Круиз-режим ===")
        print("Круиз-режим позволяет камере автоматически двигаться по оси X или Y")
        print("1. Показать статус круиз-режима")
        print("2. Включить круиз по оси X (горизонтально)")
        print("3. Включить круиз по оси Y (вертикально)")
        print("4. Выключить круиз")
        print("5. Вернуться в меню")

        choice = input("\nВаш выбор: ").strip()

        if choice == "1":
            self._show_cruise_status()
        elif choice == "2":
            self._set_cruise(True, "x")
        elif choice == "3":
            self._set_cruise(True, "y")
        elif choice == "4":
            self._set_cruise(False)
        elif choice != "5":
            print("Неверный выбор")

    def _show_cruise_status(self):
        """Показать статус круиз-режима."""
        try:
            cruise = self.cam.getCruise()
            print(f"\nСтатус круиз-режима: {cruise}")
        except Exception as e:
            print(f"✗ Ошибка при получении статуса: {e}")

    def _set_cruise(self, enabled, coord=False):
        """Установить круиз-режим."""
        try:
            if enabled:
                coord_name = "X" if coord == "x" else "Y"
                print(f"\nВключение круиз-режима по оси {coord_name}...")
            else:
                print("\nВыключение круиз-режима...")

            result = self.cam.setCruise(enabled, coord)
            if result.get("error_code") == 0:
                if enabled:
                    print(f"✓ Круиз-режим по оси {coord_name} включен")
                else:
                    print("✓ Круиз-режим выключен")
            else:
                print(f"✗ Ошибка: {result}")
        except Exception as e:
            print(f"✗ Ошибка при установке круиз-режима: {e}")

    def calibrate_motor(self):
        """Калибровка мотора."""
        print("\n=== Калибровка мотора ===")
        confirm = input("Вы уверены, что хотите запустить калибровку? (yes/no): ").strip().lower()
        if confirm == "yes":
            try:
                print("Запуск калибровки...")
                result = self.cam.calibrateMotor()
                if result.get("error_code") == 0:
                    print("✓ Калибровка запущена")
                else:
                    print(f"✗ Ошибка: {result}")
            except Exception as e:
                print(f"✗ Ошибка при калибровке: {e}")
        else:
            print("Калибровка отменена")

    def manage_privacy_mode(self):
        """Управление режимом приватности."""
        print("\n=== Режим приватности ===")
        try:
            privacy = self.cam.getPrivacyMode()
            current_status = privacy.get("enabled") == "on"
            print(f"Текущий статус: {'Включен' if current_status else 'Выключен'}")

            print("\n1. Включить режим приватности")
            print("2. Выключить режим приватности")
            print("3. Вернуться в меню")

            choice = input("\nВаш выбор: ").strip()

            if choice == "1":
                self.cam.setPrivacyMode(True)
                print("✓ Режим приватности включен")
            elif choice == "2":
                self.cam.setPrivacyMode(False)
                print("✓ Режим приватности выключен")
            elif choice != "3":
                print("Неверный выбор")
        except Exception as e:
            print(f"✗ Ошибка: {e}")

    def show_other_features(self):
        """Показать другие возможности камеры."""
        print("\n=== Другие возможности камеры ===")
        print("1. Статус LED индикатора")
        print("2. Статус записи")
        print("3. Настройки обнаружения движения")
        print("4. Режим день/ночь")
        print("5. Вернуться в меню")

        choice = input("\nВаш выбор: ").strip()

        if choice == "1":
            self._show_led_status()
        elif choice == "2":
            self._show_record_status()
        elif choice == "3":
            self._show_motion_detection()
        elif choice == "4":
            self._show_day_night_mode()
        elif choice != "5":
            print("Неверный выбор")

    def _show_led_status(self):
        """Показать статус LED."""
        try:
            led = self.cam.getLED()
            status = "Включен" if led.get("enabled") == "on" else "Выключен"
            print(f"\nLED индикатор: {status}")
        except Exception as e:
            print(f"✗ Ошибка: {e}")

    def _show_record_status(self):
        """Показать статус записи."""
        try:
            record_plan = self.cam.getRecordPlan()
            print(f"\nПлан записи: {record_plan}")
        except Exception as e:
            print(f"✗ Ошибка: {e}")

    def _show_motion_detection(self):
        """Показать настройки обнаружения движения."""
        try:
            motion = self.cam.getMotionDetection()
            enabled = motion.get("enabled") == "on"
            sensitivity = motion.get("sensitivity", "N/A")
            print(f"\nОбнаружение движения:")
            print(f"  Включено: {'Да' if enabled else 'Нет'}")
            print(f"  Чувствительность: {sensitivity}")
        except Exception as e:
            print(f"✗ Ошибка: {e}")

    def _show_day_night_mode(self):
        """Показать режим день/ночь."""
        try:
            mode = self.cam.getDayNightMode()
            mode_names = {"on": "Ночь", "off": "День", "auto": "Автоматически"}
            print(f"\nРежим день/ночь: {mode_names.get(mode, mode)}")
        except Exception as e:
            print(f"✗ Ошибка: {e}")

    def run(self):
        """Главный цикл программы."""
        while True:
            print("\n" + "=" * 50)
            print("МЕНЮ УПРАВЛЕНИЯ КАМЕРОЙ TAPO")
            print("=" * 50)
            print("ДВИЖЕНИЕ КАМЕРЫ:")
            print("  1. Базовые направления (влево/вправо/вверх/вниз)")
            print("  2. Движение по координатам")
            print("  3. Движение по углу")
            print("  4. Управление пресетами")
            print("  5. Круиз-режим")
            print("  6. Калибровка мотора")
            print("\nИНФОРМАЦИЯ И НАСТРОЙКИ:")
            print("  7. Базовая информация о камере")
            print("  8. Возможности мотора")
            print("  9. Режим приватности")
            print("  10. Другие возможности")
            print("\n  0. Выход")

            choice = input("\nВаш выбор: ").strip()

            if choice == "1":
                self.move_basic_directions()
            elif choice == "2":
                self.move_by_coordinates()
            elif choice == "3":
                self.move_by_angle()
            elif choice == "4":
                self.manage_presets()
            elif choice == "5":
                self.manage_cruise()
            elif choice == "6":
                self.calibrate_motor()
            elif choice == "7":
                self.show_basic_info()
            elif choice == "8":
                self.show_motor_capability()
            elif choice == "9":
                self.manage_privacy_mode()
            elif choice == "10":
                self.show_other_features()
            elif choice == "0":
                print("\nДо свидания!")
                break
            else:
                print("Неверный выбор. Попробуйте снова.")


def main():
    """Главная функция."""
    print("=" * 50)
    print("СКРИПТ ДЛЯ ИЗУЧЕНИЯ БИБЛИОТЕКИ PYTAPO")
    print("=" * 50)

    # Загрузка переменных из .env файла
    env_vars = load_env_file()
    
    # Получение параметров подключения из .env или переменных окружения
    host = (
        env_vars.get("TAPO_HOST") or 
        os.getenv("TAPO_HOST") or 
        "192.168.0.113"
    )
    user = (
        env_vars.get("TAPO_USER") or 
        os.getenv("TAPO_USER") or 
        "admin"
    )
    password = (
        env_vars.get("TAPO_PASSWORD") or 
        os.getenv("TAPO_PASSWORD")
    )

    # Если пароль не найден в .env, запросить у пользователя
    if not password:
        print("\nПараметры подключения не найдены в .env файле.")
        print("Используются значения по умолчанию или запрос у пользователя.\n")
        host_input = input(f"Введите IP адрес камеры [{host}]: ").strip()
        if host_input:
            host = host_input
        
        user_input = input(f"Введите имя пользователя [{user}]: ").strip()
        if user_input:
            user = user_input
        
        password = input("Введите пароль: ").strip()
        
        if not password:
            print("✗ Ошибка: пароль обязателен")
            return
    else:
        print(f"\n✓ Параметры подключения загружены из .env файла")
        print(f"  Host: {host}")
        print(f"  User: {user}\n")

    try:
        explorer = TapoExplorer(host, user, password)
        explorer.run()
    except KeyboardInterrupt:
        print("\n\nПрограмма прервана пользователем")
    except Exception as e:
        print(f"\n✗ Критическая ошибка: {e}")


if __name__ == "__main__":
    main()

