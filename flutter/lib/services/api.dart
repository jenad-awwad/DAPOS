import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'token_storage.dart';

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({TokenStorage? tokenStorage, String? baseUrl})
      : _tokens = tokenStorage ?? TokenStorage(),
        baseUrl = baseUrl ??
            const String.fromEnvironment(
              'API_URL',
              defaultValue: 'https://dapos-api-production.up.railway.app',
            );

  final TokenStorage _tokens;
  final String baseUrl;

  Future<T> _request<T>(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    bool auth = true,
    T Function(Map<String, dynamic> json)? parse,
  }) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth) {
      final token = await _tokens.read();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    final uri = Uri.parse('$baseUrl$path');
    late http.Response response;
    switch (method) {
      case 'POST':
        response = await http.post(uri, headers: headers, body: jsonEncode(body));
        break;
      case 'PATCH':
        response = await http.patch(uri, headers: headers, body: jsonEncode(body));
        break;
      default:
        response = await http.get(uri, headers: headers);
    }

    final decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = data['error'];
      throw ApiException(error is String ? error : 'Request failed');
    }

    if (parse != null) return parse(data);
    return data as T;
  }

  Future<LoginResponse> login(String phone, String pin) {
    return _request(
      '/auth/login',
      method: 'POST',
      auth: false,
      body: {'phone': phone, 'pin': pin},
      parse: LoginResponse.fromJson,
    );
  }

  Future<({User user, Store store})> me() {
    return _request(
      '/auth/me',
      parse: (json) => (
        user: User.fromJson(json['user'] as Map<String, dynamic>),
        store: Store.fromJson(json['store'] as Map<String, dynamic>),
      ),
    );
  }

  Future<List<Product>> fetchProducts({
    String? search,
    String? categoryId,
    bool pricedOnly = false,
  }) {
    final query = <String, String>{};
    if (search != null && search.isNotEmpty) query['search'] = search;
    if (categoryId != null && categoryId.isNotEmpty) {
      query['categoryId'] = categoryId;
    }
    if (pricedOnly) query['pricedOnly'] = 'true';
    final qs = Uri(queryParameters: query.isEmpty ? null : query).query;
    return _request(
      '/products${qs.isEmpty ? '' : '?$qs'}',
      parse: (json) => (json['products'] as List<dynamic>)
          .map((item) => Product.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<Product> fetchProductByBarcode(String barcode) {
    return _request(
      '/products/barcode/${Uri.encodeComponent(barcode)}',
      parse: (json) => Product.fromJson(json['product'] as Map<String, dynamic>),
    );
  }

  Future<List<Category>> fetchCategories() {
    return _request(
      '/categories',
      parse: (json) => (json['categories'] as List<dynamic>)
          .map((item) => Category.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<Product> createProduct({
    String? sku,
    String? barcode,
    required String name,
    required String supplier,
    required String imageUrl,
    int onStock = 0,
    String? categoryId,
  }) {
    return _request(
      '/products',
      method: 'POST',
      body: {
        'sku': sku,
        'barcode': barcode,
        'name': name,
        'supplier': supplier,
        'imageUrl': imageUrl,
        'onStock': onStock,
        'categoryId': categoryId,
      },
      parse: (json) => Product.fromJson(json['product'] as Map<String, dynamic>),
    );
  }

  Future<Product> setProductPricing(String id, {required double price, required double cost}) {
    return _request(
      '/products/$id/pricing',
      method: 'PATCH',
      body: {'price': price, 'cost': cost},
      parse: (json) => Product.fromJson(json['product'] as Map<String, dynamic>),
    );
  }

  Future<Order> createOrder({
    required List<Map<String, dynamic>> items,
    required PaymentMethod paymentMethod,
  }) {
    return _request(
      '/orders',
      method: 'POST',
      body: {
        'items': items,
        'paymentMethod': paymentMethod.apiValue,
      },
      parse: (json) => Order.fromJson(json['order'] as Map<String, dynamic>),
    );
  }

  Future<List<Order>> fetchOrders({
    int? limit,
    String? dateFrom,
    String? dateTo,
    String? status,
  }) {
    final query = <String, String>{};
    if (limit != null) query['limit'] = '$limit';
    if (dateFrom != null) query['dateFrom'] = dateFrom;
    if (dateTo != null) query['dateTo'] = dateTo;
    if (status != null) query['status'] = status;
    final qs = Uri(queryParameters: query.isEmpty ? null : query).query;
    return _request(
      '/orders${qs.isEmpty ? '' : '?$qs'}',
      parse: (json) => (json['orders'] as List<dynamic>)
          .map((item) => Order.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<ItemSalesSummary> fetchItemSalesReport({String? dateFrom, String? dateTo}) {
    final query = <String, String>{};
    if (dateFrom != null) query['dateFrom'] = dateFrom;
    if (dateTo != null) query['dateTo'] = dateTo;
    final qs = Uri(queryParameters: query.isEmpty ? null : query).query;
    return _request(
      '/orders/reports/item-sales${qs.isEmpty ? '' : '?$qs'}',
      parse: (json) => ItemSalesSummary.fromJson(
        json['summary'] as Map<String, dynamic>,
      ),
    );
  }
}
