enum UserRole { admin, manager, cashier }

UserRole userRoleFromString(String value) {
  switch (value) {
    case 'ADMIN':
      return UserRole.admin;
    case 'MANAGER':
      return UserRole.manager;
    default:
      return UserRole.cashier;
  }
}

String userRoleToApi(UserRole role) {
  switch (role) {
    case UserRole.admin:
      return 'ADMIN';
    case UserRole.manager:
      return 'MANAGER';
    case UserRole.cashier:
      return 'CASHIER';
  }
}

class User {
  const User({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    required this.storeId,
  });

  final String id;
  final String name;
  final String phone;
  final UserRole role;
  final String storeId;

  bool get canManageProducts =>
      role == UserRole.admin || role == UserRole.manager;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
      role: userRoleFromString(json['role'] as String? ?? 'CASHIER'),
      storeId: json['storeId'] as String,
    );
  }
}

class Store {
  const Store({
    required this.id,
    required this.name,
    required this.currency,
    required this.taxRate,
  });

  final String id;
  final String name;
  final String currency;
  final num taxRate;

  factory Store.fromJson(Map<String, dynamic> json) {
    return Store(
      id: json['id'] as String,
      name: json['name'] as String,
      currency: json['currency'] as String? ?? 'USD',
      taxRate: json['taxRate'] as num? ?? 0,
    );
  }
}

class Category {
  const Category({
    required this.id,
    required this.name,
    this.sortOrder = 0,
  });

  final String id;
  final String name;
  final int sortOrder;

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] as String,
      name: json['name'] as String,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }
}

class Product {
  const Product({
    required this.id,
    required this.barcode,
    required this.name,
    required this.imageUrl,
    required this.supplier,
    required this.price,
    required this.onStock,
    required this.isPriced,
    this.sku,
    this.cost,
    this.lowStockAt,
    this.categoryId,
    this.category,
  });

  final String id;
  final String? sku;
  final String barcode;
  final String name;
  final String imageUrl;
  final String supplier;
  final double price;
  final double? cost;
  final int onStock;
  final int? lowStockAt;
  final String? categoryId;
  final bool isPriced;
  final Category? category;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      sku: json['sku'] as String?,
      barcode: json['barcode'] as String? ?? '',
      name: json['name'] as String,
      imageUrl: json['imageUrl'] as String? ?? '',
      supplier: json['supplier'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      cost: (json['cost'] as num?)?.toDouble(),
      onStock: (json['onStock'] as num?)?.toInt() ?? 0,
      lowStockAt: (json['lowStockAt'] as num?)?.toInt(),
      categoryId: json['categoryId'] as String?,
      isPriced: json['isPriced'] as bool? ?? false,
      category: json['category'] is Map<String, dynamic>
          ? Category.fromJson(json['category'] as Map<String, dynamic>)
          : null,
    );
  }
}

class CartItem {
  const CartItem({required this.product, required this.quantity});

  final Product product;
  final int quantity;

  CartItem copyWith({Product? product, int? quantity}) {
    return CartItem(
      product: product ?? this.product,
      quantity: quantity ?? this.quantity,
    );
  }
}

enum PaymentMethod { cash, card, cheque, debit, breakage, delivery }

extension PaymentMethodApi on PaymentMethod {
  String get apiValue {
    switch (this) {
      case PaymentMethod.cash:
        return 'CASH';
      case PaymentMethod.card:
        return 'CARD';
      case PaymentMethod.cheque:
        return 'CHEQUE';
      case PaymentMethod.debit:
        return 'DEBIT';
      case PaymentMethod.breakage:
        return 'BREAKAGE';
      case PaymentMethod.delivery:
        return 'DELIVERY';
    }
  }

  String get label {
    switch (this) {
      case PaymentMethod.cash:
        return 'Cash';
      case PaymentMethod.card:
        return 'Card';
      case PaymentMethod.cheque:
        return 'Cheque';
      case PaymentMethod.debit:
        return 'Debit';
      case PaymentMethod.breakage:
        return 'Breakage';
      case PaymentMethod.delivery:
        return 'Delivery';
    }
  }
}

class OrderCustomer {
  const OrderCustomer({required this.id, required this.name, this.phone});

  final String id;
  final String name;
  final String? phone;

  factory OrderCustomer.fromJson(Map<String, dynamic> json) {
    return OrderCustomer(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
    );
  }
}

class Order {
  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.subtotal,
    required this.taxAmount,
    required this.discountTotal,
    required this.total,
    this.completedAt,
    this.createdAt,
    this.customer,
  });

  final String id;
  final String orderNumber;
  final String status;
  final double subtotal;
  final double taxAmount;
  final double discountTotal;
  final double total;
  final DateTime? completedAt;
  final DateTime? createdAt;
  final OrderCustomer? customer;

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String,
      status: json['status'] as String? ?? '',
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      taxAmount: (json['taxAmount'] as num?)?.toDouble() ?? 0,
      discountTotal: (json['discountTotal'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'] as String)
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
      customer: json['customer'] is Map<String, dynamic>
          ? OrderCustomer.fromJson(json['customer'] as Map<String, dynamic>)
          : null,
    );
  }
}

class LoginResponse {
  const LoginResponse({
    required this.token,
    required this.user,
    required this.store,
  });

  final String token;
  final User user;
  final Store store;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      token: json['token'] as String,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      store: Store.fromJson(json['store'] as Map<String, dynamic>),
    );
  }
}

class ItemSalesSummary {
  const ItemSalesSummary({
    required this.quantitySold,
    required this.totalRevenue,
    required this.totalCost,
  });

  final int quantitySold;
  final double totalRevenue;
  final double totalCost;

  factory ItemSalesSummary.fromJson(Map<String, dynamic> json) {
    return ItemSalesSummary(
      quantitySold: (json['quantitySold'] as num?)?.toInt() ?? 0,
      totalRevenue: (json['totalRevenue'] as num?)?.toDouble() ?? 0,
      totalCost: (json['totalCost'] as num?)?.toDouble() ?? 0,
    );
  }
}
