import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_widgets.dart';
import 'home_screen.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  bool _loading = true;
  bool _refreshing = false;
  List<Order> _orders = [];
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
        api.fetchOrders(limit: 50, dateFrom: range.from, dateTo: range.to),
        api.fetchItemSalesReport(dateFrom: range.from, dateTo: range.to),
      ]);
      final orders = (results[0] as List<Order>).where((o) => o.status == 'COMPLETED').toList();
      final report = results[1] as ItemSalesSummary;
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _salesTotal = orders.fold(0, (sum, o) => sum + o.total);
        _itemsSold = report.quantitySold;
        _profit = report.totalRevenue - report.totalCost;
      });
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
    final currency = context.watch<AuthState>().currency;

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
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text('Reports', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Text('${formatShortDate()} · Today', style: const TextStyle(color: AppColors.textMuted)),
            ),
            if (_loading && !_refreshing)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else ...[
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 20),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.lg),
                ),
                child: Column(
                  children: [
                    _row('Sales', formatMoney(_salesTotal, currency)),
                    _row('Orders', '${_orders.length}'),
                    _row('Items sold', '$_itemsSold'),
                    _row('Profit', formatMoney(_profit, currency), valueColor: AppColors.green),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: Text("Today's orders", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
              if (_orders.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text('No completed orders today', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textMuted)),
                )
              else
                for (final order in _orders) OrderRow(order: order, currency: currency),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600, fontSize: 15))),
          Text(value, style: TextStyle(color: valueColor ?? AppColors.text, fontWeight: FontWeight.w800, fontSize: 18)),
        ],
      ),
    );
  }
}
