import 'package:flutter/foundation.dart';

import '../models/models.dart';

class CartState extends ChangeNotifier {
  final List<CartItem> _items = [];

  List<CartItem> get items => List.unmodifiable(_items);

  int get itemCount => _items.fold(0, (sum, item) => sum + item.quantity);

  double get subtotal => _items.fold(
        0,
        (sum, item) => sum + item.product.price * item.quantity,
      );

  int getQuantity(String productId) {
    for (final item in _items) {
      if (item.product.id == productId) return item.quantity;
    }
    return 0;
  }

  bool addProduct(Product product) {
    final index = _items.indexWhere((item) => item.product.id == product.id);
    if (index >= 0) {
      final existing = _items[index];
      if (existing.quantity >= product.onStock) return false;
      _items[index] = existing.copyWith(quantity: existing.quantity + 1);
      notifyListeners();
      return true;
    }
    if (product.onStock < 1) return false;
    _items.add(CartItem(product: product, quantity: 1));
    notifyListeners();
    return true;
  }

  void setQuantity(String productId, int quantity) {
    final index = _items.indexWhere((item) => item.product.id == productId);
    if (index < 0) return;
    final product = _items[index].product;
    final next = quantity.clamp(0, product.onStock);
    if (next == 0) {
      _items.removeAt(index);
    } else {
      _items[index] = _items[index].copyWith(quantity: next);
    }
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
