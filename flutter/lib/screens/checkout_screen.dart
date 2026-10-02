import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../state/cart_state.dart';
import '../theme/app_theme.dart';


class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  PaymentMethod _payment = PaymentMethod.cash;
  bool _loading = false;
  String _error = '';
  String _success = '';

  Future<void> _completeSale() async {
    final cart = context.read<CartState>();
    setState(() {
      _error = '';
      _success = '';
      _loading = true;
    });
    try {
      final result = await context.read<AuthState>().api.createOrder(
            items: cart.items
                .map((item) => {'productId': item.product.id, 'quantity': item.quantity})
                .toList(),
            paymentMethod: _payment,
          );
      cart.clear();
      setState(() => _success = 'Sale ${result.orderNumber} completed');
      await Future<void>.delayed(const Duration(milliseconds: 1200));
      if (mounted) context.go('/pos');
    } catch (err) {
      setState(() => _error = err.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final currency = context.watch<AuthState>().currency;

    if (cart.items.isEmpty && _success.isEmpty) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Cart is empty', style: TextStyle(color: AppColors.textMuted, fontSize: 16)),
              TextButton(onPressed: () => context.pop(), child: const Text('Back to products')),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('${cart.items.length} items', style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          TextButton(
            onPressed: cart.clear,
            child: const Text('Clear cart', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          for (final item in cart.items)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.product.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  Text('${formatMoney(item.product.price, currency)} each', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _qtyBtn('−', () => cart.setQuantity(item.product.id, item.quantity - 1)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text('${item.quantity}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                      ),
                      _qtyBtn('+', () => cart.setQuantity(item.product.id, item.quantity + 1)),
                      const Spacer(),
                      Text(
                        formatMoney(item.product.price * item.quantity, currency),
                        style: const TextStyle(color: AppColors.primary, fontSize: 17, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          const Padding(
            padding: EdgeInsets.only(top: 8, bottom: 8),
            child: Text('Payment', style: TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w700)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final method in PaymentMethod.values)
                ChoiceChip(
                  label: Text(method.label),
                  selected: _payment == method,
                  onSelected: (_) => setState(() => _payment = method),
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(
                    color: _payment == method ? Colors.white : AppColors.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger)),
            ),
          if (_success.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_success, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.green, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Total', style: TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
                  Text(
                    formatMoney(cart.subtotal, currency),
                    style: const TextStyle(color: AppColors.primary, fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
            FilledButton(
              onPressed: _loading || cart.items.isEmpty ? null : _completeSale,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _loading
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Complete sale', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _qtyBtn(String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Ink(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
        child: Center(
          child: Text(label, style: const TextStyle(color: AppColors.primary, fontSize: 22, fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}
