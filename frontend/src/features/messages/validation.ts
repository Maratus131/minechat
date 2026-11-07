export function validateMessage(text: string, files: File[]): string | undefined {
  if (!text.trim() && !files.length) return 'Добавьте текст или файл.';
  if (text.length > 4096) return 'В сообщении может быть не более 4096 символов.';
  if (text.includes('\0')) return 'Удалите нулевой символ из текста.';
  if (files.length > 5) return 'К одному сообщению можно приложить до 5 файлов.';
  if (files.some((file) => file.size === 0)) return 'Пустые файлы не поддерживаются. Удалите их из вложений.';
  if (files.some((file) => file.size > 10 * 1024 * 1024)) return 'Размер каждого файла должен быть не больше 10 МиБ.';
}
