import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  bool _refreshing = false;
  List<Order> _orders = [];
  int _orderCount = 0;
  double _salesTotal = 0;
  int _itemsSold = 0;
  double _profit = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AuthState>().api;
    final range = todayRange();
    try {
      final results = await Future.wait([
        api.fetchOrders(limit: 20, dateFrom: range.from, dateTo: range.to),
        api.fetchItemSalesReport(dateFrom: range.from, dateTo: range.to),
      ]);
      final orders = (results[0] as List<Order>).where((o) => o.status == 'COMPLETED').toList();
      final report = results[1] as ItemSalesSummary;
      if (!mounted) return;
      setState(() {
        _orderCount = orders.length;
        _orders = orders.take(5).toList();
        _salesTotal = orders.fold(0, (sum, order) => sum + order.total);
        _itemsSold = report.quantitySold;
        _profit = report.totalRevenue - report.totalCost;
      });
    } catch (_) {
      // Keep previous values when refresh fails.
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _refreshing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final currency = auth.currency;
    final canAdd = auth.user?.canManageProducts ?? false;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          setState(() => _refreshing = true);
          await _load();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 120),
          children: [
            const AppHeader(),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${greetingForHour()} 👋',
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.text),
                  ),
                  const SizedBox(height: 4),
                  const Text('Welcome back', style: TextStyle(color: AppColors.textMuted, fontSize: 15)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: _ActionCard(
                      color: AppColors.primary,
                      icon: Icons.shopping_cart,
                      iconColor: Colors.white,
                      iconBg: Colors.white24,
                      title: 'POS',
                      subtitle: 'Start Selling',
                      titleColor: Colors.white,
                      subtitleColor: Colors.white70,
                      onTap: () => context.go('/pos'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ActionCard(
                      color: AppColors.greenSoft,
                      icon: canAdd ? Icons.add : Icons.inventory_2,
                      iconColor: AppColors.green,
                      iconBg: AppColors.surface,
                      title: canAdd ? 'Add Product' : 'Products',
                      subtitle: canAdd ? 'New Product' : 'Browse catalog',
                      titleColor: AppColors.text,
                      subtitleColor: AppColors.textMuted,
                      bordered: true,
                      onTap: () => context.push(canAdd ? '/inventory/add-product' : '/products'),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('Today Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  Text(formatShortDate(), style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            if (_loading && !_refreshing)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _MetricCard(label: 'Sales', value: formatMoney(_salesTotal, currency), icon: Icons.payments_outlined, tint: AppColors.primary, bg: AppColors.primarySoft),
                    _MetricCard(label: 'Orders', value: '$_orderCount', icon: Icons.receipt_long_outlined, tint: AppColors.green, bg: AppColors.greenSoft),
                    _MetricCard(label: 'Items Sold', value: '$_itemsSold', icon: Icons.inventory_2_outlined, tint: AppColors.orange, bg: AppColors.orangeSoft),
                    _MetricCard(label: 'Profit', value: formatMoney(_profit, currency), icon: Icons.trending_up, tint: AppColors.blue, bg: AppColors.blueSoft),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('Recent Orders', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  TextButton(
                    onPressed: () => context.go('/reports'),
                    child: const Text('View All', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
            if (_orders.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('No orders yet today', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textMuted)),
              )
            else
              for (final order in _orders) _OrderRow(order: order, currency: currency),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.color,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.subtitle,
    required this.titleColor,
    required this.subtitleColor,
    required this.onTap,
    this.bordered = false,
  });

  final Color color;
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String subtitle;
  final Color titleColor;
  final Color subtitleColor;
  final VoidCallback onTap;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      child: Ink(
        height: 130,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(AppRadii.lg),
          border: bordered ? Border.all(color: const Color(0xFFBBF7D0)) : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(14)),
              child: Icon(icon, color: iconColor),
            ),
            const Spacer(),
            Text(title, style: TextStyle(color: titleColor, fontSize: 22, fontWeight: FontWeight.w800)),
            Text(subtitle, style: TextStyle(color: subtitleColor, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    required this.bg,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    final width = (MediaQuery.sizeOf(context).width - 52) / 2;
    return Container(
      width: width,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: tint, size: 18),
          ),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w800, fontSize: 20)),
        ],
      ),
    );
  }
}

class OrderRow extends StatelessWidget {
  const OrderRow({super.key, required this.order, required this.currency});

  final Order order;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return _OrderRow(order: order, currency: currency);
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.currency});

  final Order order;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.shopping_bag_outlined, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('#${order.orderNumber}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                Text(order.customer?.name ?? 'Walk-In Customer', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatMoney(order.total, currency), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              Text(
                formatTimeAgo(order.completedAt ?? order.createdAt),
                style: const TextStyle(color: AppColors.textLight, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
