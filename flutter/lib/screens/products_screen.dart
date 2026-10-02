import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_widgets.dart';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  final _search = TextEditingController();
  List<Product> _products = [];
  bool _loading = true;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final products = await context.read<AuthState>().api.fetchProducts(
            search: _search.text.trim().isEmpty ? null : _search.text.trim(),
            pricedOnly: true,
          );
      if (mounted) setState(() => _products = products);
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
      child: Column(
        children: [
          const AppHeader(),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: TextField(
              controller: _search,
              onChanged: (_) {
                setState(() => _loading = true);
                _load();
              },
              decoration: InputDecoration(
                hintText: 'Search products...',
                hintStyle: const TextStyle(color: AppColors.textLight),
                filled: true,
                fillColor: AppColors.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading && !_refreshing
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : RefreshIndicator(
                    onRefresh: () async {
                      setState(() => _refreshing = true);
                      await _load();
                    },
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
                      itemCount: _products.isEmpty ? 1 : _products.length,
                      itemBuilder: (context, index) {
                        if (_products.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.only(top: 40),
                            child: Text('No products found', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textMuted)),
                          );
                        }
                        final item = _products[index];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(item.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                    Text('Stock ${item.onStock}', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                                  ],
                                ),
                              ),
                              Text(
                                formatMoney(item.price, currency),
                                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 16),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
