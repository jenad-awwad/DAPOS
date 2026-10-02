import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class AppColors {
  static const background = Color(0xFFF4F5F9);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF1E293B);
  static const textMuted = Color(0xFF64748B);
  static const textLight = Color(0xFF94A3B8);
  static const primary = Color(0xFF5B4CFF);
  static const primarySoft = Color(0xFFEEEDFF);
  static const green = Color(0xFF22C55E);
  static const greenSoft = Color(0xFFDCFCE7);
  static const orange = Color(0xFFF97316);
  static const orangeSoft = Color(0xFFFFEDD5);
  static const blue = Color(0xFF3B82F6);
  static const blueSoft = Color(0xFFDBEAFE);
  static const pink = Color(0xFFEC4899);
  static const pinkSoft = Color(0xFFFCE7F3);
  static const teal = Color(0xFF14B8A6);
  static const tealSoft = Color(0xFFCCFBF1);
  static const border = Color(0xFFE2E8F0);
  static const danger = Color(0xFFEF4444);
  static const dangerSoft = Color(0xFFFEE2E2);
}

class AppRadii {
  static const sm = 10.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
}

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: AppColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      foregroundColor: AppColors.text,
      elevation: 0,
    ),
  );
}

String roleLabel(String? role) {
  if (role == 'ADMIN') return 'Administrator';
  if (role == 'MANAGER') return 'Manager';
  return 'Cashier';
}

String greetingForHour([int? hour]) {
  final h = hour ?? DateTime.now().hour;
  if (h < 12) return 'Good Morning!';
  if (h < 17) return 'Good Afternoon!';
  return 'Good Evening!';
}

({String from, String to}) todayRange() {
  final now = DateTime.now();
  final from = DateTime(now.year, now.month, now.day);
  final to = DateTime(now.year, now.month, now.day, 23, 59, 59, 999);
  return (from: from.toUtc().toIso8601String(), to: to.toUtc().toIso8601String());
}

String formatShortDate([DateTime? value]) {
  return DateFormat.yMMMd().format(value ?? DateTime.now());
}

String formatTimeAgo(DateTime? date) {
  if (date == null) return '';
  final mins = DateTime.now().difference(date).inMinutes;
  if (mins < 1) return 'Just now';
  if (mins < 60) return '$mins min ago';
  final hours = mins ~/ 60;
  if (hours < 24) return '$hours hr ago';
  return formatShortDate(date);
}

String formatMoney(num amount, String currency) {
  try {
    return NumberFormat.currency(name: currency, decimalDigits: 2).format(amount);
  } catch (_) {
    return '$currency ${amount.toStringAsFixed(2)}';
  }
}
