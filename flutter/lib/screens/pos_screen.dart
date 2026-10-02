import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../state/cart_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_widgets.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final _search = TextEditingController();
  final _barcode = TextEditingController();
  Timer? _debounce;
  Timer? _toastTimer;
  String _debouncedSearch = '';
  String? _selectedCategory;
  List<Product> _products = [];
  List<Category> _categories = [];
  bool _loading = true;
  String _error = '';
  String _toast = '';

  @override
  void initState() {
    super.initState();
    _search.addListener(() {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 300), () {
        setState(() => _debouncedSearch = _search.text.trim());
        _load();
      });
    });
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _toastTimer?.cancel();
    _search.dispose();
    _barcode.dispose();
    super.dispose();
  }

  void _showToast(String message) {
    _toastTimer?.cancel();
    setState(() => _toast = message);
    _toastTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _toast = '');
    });
  }

  Future<void> _load() async {
    setState(() => _error = '');
    try {
      final api = context.read<AuthState>().api;
      final results = await Future.wait([
        api.fetchProducts(
          search: _debouncedSearch.isEmpty ? null : _debouncedSearch,
          categoryId: _selectedCategory,
          pricedOnly: true,
        ),
        api.fetchCategories(),
      ]);
      if (!mounted) return;
      setState(() {
        _products = results[0] as List<Product>;
        _categories = results[1] as List<Category>;
        _loading = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.toString();
        _loading = false;
      });
    }
  }

  void _handleAdd(Product product) {
    final added = context.read<CartState>().addProduct(product);
    _showToast(
      added
          ? 'Added ${product.name}'
          : product.onStock < 1
              ? 'Out of stock'
              : 'Max stock reached',
    );
  }

  Future<void> _handleBarcode() async {
    final code = _barcode.text.trim();
    if (code.isEmpty) return;
    try {
      final product = await context.read<AuthState>().api.fetchProductByBarcode(code);
      _handleAdd(product);
      _barcode.clear();
    } catch (_) {
      _showToast('Product not found');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final cart = context.watch<CartState>();
    final currency = auth.currency;

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          const AppHeader(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _search,
                  decoration: _field('Search name or SKU...'),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _barcode,
                        keyboardType: TextInputType.number,
                        onSubmitted: (_) => _handleBarcode(),
                        decoration: _field('Barcode — scan or type'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _handleBarcode,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.sm)),
                      ),
                      child: const Text('Find', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                if (auth.user?.canManageProducts == true)
                  TextButton(
                    onPressed: () => context.push('/inventory/add-product'),
                    child: const Text('+ New product', style: TextStyle(color: AppColors.green, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _chip('All', _selectedCategory == null, () {
                  setState(() => _selectedCategory = null);
                  _load();
                }),
                for (final category in _categories)
                  _chip(category.name, _selectedCategory == category.id, () {
                    setState(() => _selectedCategory = category.id);
                    _load();
                  }),
              ],
            ),
          ),
          if (_toast.isNotEmpty)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 6, 16, 6),
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
              decoration: BoxDecoration(color: AppColors.greenSoft, borderRadius: BorderRadius.circular(10)),
              child: Text(_toast, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF166534), fontWeight: FontWeight.w600)),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : _error.isNotEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger)),
                            TextButton(onPressed: _load, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: EdgeInsets.only(top: 4, bottom: cart.itemCount > 0 ? 110 : 24),
                          itemCount: _products.isEmpty ? 1 : _products.length,
                          itemBuilder: (context, index) {
                            if (_products.isEmpty) {
                              return const Padding(
                                padding: EdgeInsets.only(top: 40),
                                child: Text('No products found', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textMuted)),
                              );
                            }
                            final item = _products[index];
                            final quantity = cart.getQuantity(item.id);
                            return PosProductRow(
                              product: item,
                              currency: currency,
                              quantity: quantity,
                              onAdd: () => _handleAdd(item),
                              onIncrease: () => cart.setQuantity(item.id, quantity + 1),
                              onDecrease: () => cart.setQuantity(item.id, quantity - 1),
                            );
                          },
                        ),
                      ),
          ),
          if (cart.itemCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
              child: CartBar(itemCount: cart.itemCount, subtotal: cart.subtotal, currency: currency),
            ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: active,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.primary,
        labelStyle: TextStyle(color: active ? Colors.white : AppColors.textMuted, fontWeight: FontWeight.w600),
        backgroundColor: AppColors.surface,
        side: const BorderSide(color: AppColors.border),
      ),
    );
  }

  InputDecoration _field(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.textLight),
      filled: true,
      fillColor: AppColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
        borderSide: const BorderSide(color: AppColors.border),
      ),
    );
  }
}
