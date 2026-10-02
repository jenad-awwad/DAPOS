import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../lib/theme";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TIMES = Array.from({ length: 24 * 4 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDateLabel(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return value || "Select date";
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type OpenMenu = "date" | "time" | null;

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

export function DateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  const selected = parseDate(date) ?? new Date();
  const [open, setOpen] = useState<OpenMenu>(null);
  const year = selected.getFullYear();
  const monthIndex = selected.getMonth();
  const day = selected.getDate();
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => current - 1 + index);
  }, []);
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => index + 1),
    [year, monthIndex],
  );

  const applyDate = (nextYear: number, nextMonth: number, nextDay: number) => {
    const maxDay = daysInMonth(nextYear, nextMonth);
    onDateChange(`${nextYear}-${pad(nextMonth + 1)}-${pad(Math.min(nextDay, maxDay))}`);
  };

  const toggle = (menu: OpenMenu) => {
    setOpen((current) => (current === menu ? null : menu));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Date</Text>
      <Pressable style={[styles.bar, open === "date" && styles.dateBarOpen]} onPress={() => toggle("date")}>
        <Ionicons name="calendar-outline" size={18} color={colors.orange} />
        <Text style={styles.barValue}>{formatDateLabel(date)}</Text>
        <Ionicons name={open === "date" ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </Pressable>
      {open === "date" ? (
        <View style={styles.dateDropdown}>
          <TextInput
            style={styles.dateInput}
            value={date}
            onChangeText={onDateChange}
            placeholder="Type date YYYY-MM-DD"
            placeholderTextColor={colors.textLight}
          />
          <View style={styles.columns}>
            <PickerColumn
              title="Day"
              values={days.map(String)}
              selected={String(day)}
              onSelect={(value) => applyDate(year, monthIndex, Number(value))}
            />
            <PickerColumn
              title="Month"
              values={MONTHS}
              selected={MONTHS[monthIndex]}
              onSelect={(value) => applyDate(year, MONTHS.indexOf(value), day)}
            />
            <PickerColumn
              title="Year"
              values={years.map(String)}
              selected={String(year)}
              onSelect={(value) => applyDate(Number(value), monthIndex, day)}
            />
          </View>
          <Pressable style={styles.doneButton} onPress={() => setOpen(null)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.label}>Time</Text>
      <Pressable style={[styles.bar, open === "time" && styles.barOpen]} onPress={() => toggle("time")}>
        <Ionicons name="time-outline" size={18} color={colors.primary} />
        <Text style={styles.barValue}>{time || "Select time"}</Text>
        <Ionicons name={open === "time" ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </Pressable>
      {open === "time" ? (
        <View style={styles.dropdown}>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={onTimeChange}
            placeholder="Type time HH:MM"
            placeholderTextColor={colors.textLight}
          />
          <ScrollView style={styles.timeList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {TIMES.map((item) => (
              <Pressable
                key={item}
                style={[styles.timeOption, time === item && styles.timeOptionActive]}
                onPress={() => {
                  onTimeChange(item);
                  setOpen(null);
                }}
              >
                <Text style={[styles.timeOptionText, time === item && styles.timeOptionTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function PickerColumn({
  title,
  values,
  selected,
  onSelect,
}: {
  title: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      <ScrollView style={styles.columnList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {values.map((value) => {
          const active = value === selected;
          return (
            <Pressable
              key={value}
              style={[styles.columnOption, active && styles.columnOptionActive]}
              onPress={() => onSelect(value)}
            >
              <Text style={[styles.columnOptionText, active && styles.columnOptionTextActive]} numberOfLines={1}>
                {value}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.textMuted, fontWeight: "700", marginTop: 8 },
  bar: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barOpen: { borderColor: colors.primary },
  dateBarOpen: { borderColor: colors.orange },
  barValue: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "700" },
  dateDropdown: {
    backgroundColor: "#FFF7ED",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#FDBA74",
    padding: 12,
    marginTop: 4,
  },
  dateInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "#FED7AA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    marginBottom: 10,
  },
  columns: { flexDirection: "row", gap: 8, height: 200 },
  column: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  columnTitle: {
    textAlign: "center",
    fontWeight: "800",
    color: colors.orange,
    fontSize: 12,
    paddingVertical: 8,
    backgroundColor: colors.orangeSoft,
  },
  columnList: { flex: 1 },
  columnOption: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  columnOptionActive: { backgroundColor: colors.orange },
  columnOptionText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  columnOptionTextActive: { color: "#FFFFFF" },
  doneButton: {
    marginTop: 10,
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  doneText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  dropdown: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    marginBottom: 10,
  },
  timeList: { maxHeight: 220 },
  timeOption: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  timeOptionActive: { backgroundColor: colors.primarySoft },
  timeOptionText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  timeOptionTextActive: { color: colors.primary },
});
