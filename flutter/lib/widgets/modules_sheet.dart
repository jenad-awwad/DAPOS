import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/auth_state.dart';
import '../theme/app_theme.dart';

class ModuleItem {
  const ModuleItem({
    required this.label,
    required this.icon,
    required this.color,
    required this.bg,
    required this.route,
    this.adminOnly = false,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color bg;
  final String route;
  final bool adminOnly;
}

const modules = [
  ModuleItem(
    label: 'Calendar',
    icon: Icons.calendar_today_outlined,
    color: AppColors.primary,
    bg: AppColors.primarySoft,
    route: '/reports',
  ),
  ModuleItem(
    label: 'Orders',
    icon: Icons.receipt_long_outlined,
    color: AppColors.orange,
    bg: AppColors.orangeSoft,
    route: '/reports',
  ),
  ModuleItem(
    label: 'Products',
    icon: Icons.inventory_2_outlined,
    color: AppColors.orange,
    bg: AppColors.orangeSoft,
    route: '/products',
  ),
  ModuleItem(
    label: 'Inventory',
    icon: Icons.layers_outlined,
    color: AppColors.teal,
    bg: AppColors.tealSoft,
    route: '/inventory/add-product',
    adminOnly: true,
  ),
  ModuleItem(
    label: 'Reports',
    icon: Icons.bar_chart_outlined,
    color: AppColors.blue,
    bg: AppColors.blueSoft,
    route: '/reports',
  ),
  ModuleItem(
    label: 'Customers',
    icon: Icons.people_outline,
    color: AppColors.pink,
    bg: AppColors.pinkSoft,
    route: '/reports',
  ),
  ModuleItem(
    label: 'Suppliers',
    icon: Icons.person_outline,
    color: AppColors.textMuted,
    bg: Color(0xFFF1F5F9),
    route: '/products',
  ),
  ModuleItem(
    label: 'Settings',
    icon: Icons.settings_outlined,
    color: AppColors.textMuted,
    bg: Color(0xFFF1F5F9),
    route: '/reports',
  ),
];

Future<void> showModulesSheet(BuildContext context) {
  final auth = context.read<AuthState>();
  final isManager = auth.user?.canManageProducts ?? false;
  final items = modules.where((item) => !item.adminOnly || isManager).toList();

  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (sheetContext) {
      return Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.paddingOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'All Modules',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(sheetContext),
                  icon: const Icon(Icons.close, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 16,
              children: [
                for (final item in items)
                  SizedBox(
                    width: 72,
                    child: InkWell(
                      onTap: () {
                        Navigator.pop(sheetContext);
                        context.go(item.route);
                      },
                      child: Column(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: item.bg,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Icon(item.icon, color: item.color, size: 26),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            item.label,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            const Divider(color: AppColors.border),
            TextButton.icon(
              onPressed: () async {
                Navigator.pop(sheetContext);
                await auth.signOut();
                if (context.mounted) context.go('/login');
              },
              icon: const Icon(Icons.logout, color: AppColors.danger),
              label: const Text(
                'Logout',
                style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
          ],
        ),
      );
    },
  );
}
