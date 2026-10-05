export interface CoinData {
  id: string;
  value: 1 | 2;
  student: string;
  task: string;
  date: string;
  lesson?: string;
}

export const DEFAULT_COINS: CoinData[] = [
  {
    id: "coin-1",
    value: 2,
    student: "Alex Bunke",
    task: "Заняття 4. Функції, обробка помилок (try-except) з Cursor",
    date: "2026-10-03"
  },
  {
    id: "coin-2",
    value: 2,
    student: "Illia Barinov",
    task: "Заняття 4. Функції, обробка помилок (try-except) з Cursor",
    date: "2026-10-03"
  },
  {
    id: "coin-3",
    value: 1,
    student: "Олександр Білозерцев",
    task: "Заняття 4. Функції, обробка помилок (try-except) з Cursor",
    date: "2026-10-02"
  },
  {
    id: "coin-4",
    value: 1,
    student: "Cережа Nikipelov",
    task: "Заняття 4. Функції, обробка помилок (try-except) з Cursor",
    date: "2026-10-01"
  }
];
