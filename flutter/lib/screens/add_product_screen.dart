import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';

class AddProductScreen extends StatefulWidget {
  const AddProductScreen({super.key});

  @override
  State<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends State<AddProductScreen> {
  int _step = 1;
  Product? _created;
  List<Category> _categories = [];
  bool _loading = false;
  final _sku = TextEditingController();
  final _name = TextEditingController();
  final _supplier = TextEditingController();
  final _stock = TextEditingController(text: '0');
  final _barcode = TextEditingController();
  final _price = TextEditingController();
  final _cost = TextEditingController();
  String _imageUrl = '';
  String? _categoryId;
  bool _scanBarcode = false;

  @override
  void initState() {
    super.initState();
    () async {
      try {
        final value = await context.read<AuthState>().api.fetchCategories();
        if (mounted) setState(() => _categories = value);
      } catch (_) {}
    }();
  }

  @override
  void dispose() {
    _sku.dispose();
    _name.dispose();
    _supplier.dispose();
    _stock.dispose();
    _barcode.dispose();
    _price.dispose();
    _cost.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 70);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final mime = picked.mimeType ?? 'image/jpeg';
    setState(() => _imageUrl = 'data:$mime;base64,${base64Encode(bytes)}');
  }

  Future<void> _saveBasic() async {
    if (_name.text.trim().isEmpty) {
      _alert('Item name is required.');
      return;
    }
    if (_supplier.text.trim().isEmpty) {
      _alert('Supplier is required.');
      return;
    }
    if (_imageUrl.isEmpty) {
      _alert('Product photo is required.');
      return;
    }
    if (_scanBarcode && _barcode.text.trim().isEmpty) {
      _alert('Scan or enter the product barcode.');
      return;
    }

    setState(() => _loading = true);
    try {
      final product = await context.read<AuthState>().api.createProduct(
            sku: _sku.text.trim().isEmpty ? null : _sku.text.trim(),
            barcode: _scanBarcode ? _barcode.text.trim() : null,
            name: _name.text.trim(),
            supplier: _supplier.text.trim(),
            imageUrl: _imageUrl,
            onStock: int.tryParse(_stock.text) ?? 0,
            categoryId: _categoryId,
          );
      setState(() {
        _created = product;
        _step = 2;
      });
      if (mounted) _alert('Barcode: ${product.barcode}');
    } catch (err) {
      _alert(err.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _savePricing() async {
    final created = _created;
    if (created == null) return;
    final priceValue = double.tryParse(_price.text) ?? 0;
    final costValue = double.tryParse(_cost.text);
    if (priceValue <= 0) {
      _alert('Price is required.');
      return;
    }
    if (costValue == null || costValue < 0) {
      _alert('Cost is required.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AuthState>().api.setProductPricing(
            created.id,
            price: priceValue,
            cost: costValue,
          );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Complete'),
          content: const Text('Product is ready for sale.'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);
                context.pop();
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (err) {
      _alert(err.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _alert(String message) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Text(message),
        actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canManage = context.watch<AuthState>().user?.canManageProducts ?? false;
    if (!canManage) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: Text('Managers only', style: TextStyle(color: Color(0xFFF87171)))),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: const Color(0xFFF8FAFC),
        title: Text(_step == 1 ? 'New product · Step 1' : 'New product · Step 2'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            _step == 1 ? 'Item details' : 'Pricing',
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
          ),
          const SizedBox(height: 12),
          if (_step == 1) ...[
            _field(_sku, 'SKU (optional)'),
            _field(_name, 'Item name *'),
            const Text('Barcode', style: TextStyle(color: Color(0xFFCBD5E1), fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Row(
              children: [
                _modeChip('Auto', !_scanBarcode, () => setState(() => _scanBarcode = false)),
                const SizedBox(width: 8),
                _modeChip('Scan existing', _scanBarcode, () => setState(() => _scanBarcode = true)),
              ],
            ),
            const SizedBox(height: 8),
            if (_scanBarcode)
              _field(_barcode, 'Scan or type barcode *')
            else
              const Text('Barcode is generated automatically on save.', style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
            _field(_supplier, 'Supplier *'),
            _field(_stock, 'Stock *', keyboard: TextInputType.number),
            const Text('Category', style: TextStyle(color: Color(0xFFCBD5E1), fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _modeChip('None', _categoryId == null, () => setState(() => _categoryId = null)),
                for (final category in _categories)
                  _modeChip(category.name, _categoryId == category.id, () => setState(() => _categoryId = category.id)),
              ],
            ),
            const SizedBox(height: 12),
            const Text('Product photo *', style: TextStyle(color: Color(0xFFCBD5E1), fontWeight: FontWeight.w600)),
            if (_imageUrl.isNotEmpty) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.memory(base64Decode(_imageUrl.split(',').last), height: 180, fit: BoxFit.cover),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: () => _pickImage(ImageSource.camera), child: const Text('Camera'))),
                const SizedBox(width: 10),
                Expanded(child: OutlinedButton(onPressed: () => _pickImage(ImageSource.gallery), child: const Text('Gallery'))),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _loading ? null : _saveBasic,
              style: FilledButton.styleFrom(backgroundColor: AppColors.green, padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _loading
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Save and continue', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            ),
          ] else ...[
            Text(_created?.name ?? '', style: const TextStyle(color: Color(0xFFF8FAFC), fontSize: 18, fontWeight: FontWeight.w700)),
            Text('Barcode: ${_created?.barcode ?? ''}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
            _field(_price, 'Price *', keyboard: const TextInputType.numberWithOptions(decimal: true)),
            _field(_cost, 'Cost *', keyboard: const TextInputType.numberWithOptions(decimal: true)),
            FilledButton(
              onPressed: _loading ? null : _savePricing,
              style: FilledButton.styleFrom(backgroundColor: AppColors.green, padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _loading
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Complete product', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _modeChip(String label, bool active, VoidCallback onTap) {
    return ChoiceChip(
      label: Text(label),
      selected: active,
      onSelected: (_) => onTap(),
      selectedColor: const Color(0xFF166534),
      labelStyle: const TextStyle(color: Color(0xFFF8FAFC)),
      backgroundColor: const Color(0xFF1E293B),
    );
  }

  Widget _field(TextEditingController controller, String hint, {TextInputType? keyboard}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        style: const TextStyle(color: Color(0xFFF8FAFC)),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Color(0xFF64748B)),
          filled: true,
          fillColor: const Color(0xFF1E293B),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}
