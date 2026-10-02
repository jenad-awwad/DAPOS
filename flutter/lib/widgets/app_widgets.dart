import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import 'modules_sheet.dart';

class AppHeader extends StatelessWidget {
  const AppHeader({super.key, this.showMenu = true});

  final bool showMenu;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final user = auth.user;
    final initials = (user?.name ?? '?')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map((part) => part[0])
        .take(2)
        .join()
        .toUpperCase();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.primarySoft,
            child: Text(
              initials.isEmpty ? '?' : initials,
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user?.name ?? 'User',
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      '${roleLabel(userRoleToApi(user?.role ?? UserRole.cashier))} • ${auth.store?.name ?? 'Store'}',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.greenSoft,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircleAvatar(radius: 3, backgroundColor: AppColors.green),
                          SizedBox(width: 4),
                          Text(
                            'Online',
                            style: TextStyle(
                              color: AppColors.green,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (showMenu)
            IconButton.filled(
              onPressed: () => showModulesSheet(context),
              style: IconButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              icon: const Icon(Icons.menu),
            ),
        ],
      ),
    );
  }
}

class CartBar extends StatelessWidget {
  const CartBar({
    super.key,
    required this.itemCount,
    required this.subtotal,
    required this.currency,
  });

  final int itemCount;
  final double subtotal;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/pos/checkout'),
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadii.lg),
            border: Border.all(color: AppColors.border),
            boxShadow: const [
              BoxShadow(color: Color(0x1410172A), blurRadius: 12, offset: Offset(0, 4)),
            ],
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: AppColors.primary,
                child: Text(
                  '$itemCount',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'View cart',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      formatMoney(subtotal, currency),
                      style: const TextStyle(color: AppColors.text, fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'Checkout',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PosProductRow extends StatelessWidget {
  const PosProductRow({
    super.key,
    required this.product,
    required this.currency,
    required this.quantity,
    required this.onAdd,
    required this.onIncrease,
    required this.onDecrease,
  });

  final Product product;
  final String currency;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onIncrease;
  final VoidCallback onDecrease;

  @override
  Widget build(BuildContext context) {
    final outOfStock = product.onStock < 1;
    final atMax = quantity >= product.onStock;
    final lowStock = product.lowStockAt != null && product.onStock <= product.lowStockAt!;

    return Opacity(
      opacity: outOfStock ? 0.55 : 1,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 56,
                height: 56,
                child: product.imageUrl.isNotEmpty
                    ? _productImage(product.imageUrl, product.name)
                    : _placeholder(product.name),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    formatMoney(product.price, currency),
                    style: const TextStyle(color: AppColors.primary, fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    outOfStock ? 'Out of stock' : 'Stock ${product.onStock}',
                    style: TextStyle(
                      color: lowStock ? AppColors.orange : AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (quantity > 0)
              Row(
                children: [
                  _qtyButton('−', onDecrease),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      '$quantity',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
                    ),
                  ),
                  _qtyButton('+', atMax ? null : onIncrease),
                ],
              )
            else
              FilledButton(
                onPressed: outOfStock ? null : onAdd,
                style: FilledButton.styleFrom(
                  backgroundColor: outOfStock ? AppColors.border : AppColors.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(64, 40),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Add', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _productImage(String url, String name) {
    if (url.startsWith('data:')) {
      try {
        return Image.memory(base64Decode(url.split(',').last), fit: BoxFit.cover);
      } catch (_) {
        return _placeholder(name);
      }
    }
    return Image.network(
      url,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _placeholder(name),
    );
  }

  Widget _placeholder(String name) {
    return ColoredBox(
      color: AppColors.primarySoft,
      child: Center(
        child: Text(
          name.isEmpty ? '?' : name[0],
          style: const TextStyle(color: AppColors.primary, fontSize: 20, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _qtyButton(String label, VoidCallback? onPressed) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(10),
      child: Ink(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.primarySoft,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              color: AppColors.primary.withOpacity(onPressed == null ? 0.45 : 1),
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}
