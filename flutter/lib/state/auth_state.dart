import 'package:flutter/foundation.dart';

import '../models/models.dart';
import '../services/api.dart';
import '../services/token_storage.dart';

class AuthState extends ChangeNotifier {
  AuthState({ApiClient? api, TokenStorage? tokens})
      : _api = api ?? ApiClient(),
        _tokens = tokens ?? TokenStorage() {
    _api.onUnauthorized = () {
      user = null;
      store = null;
      notifyListeners();
    };
  }

  final ApiClient _api;
  final TokenStorage _tokens;

  User? user;
  Store? store;
  bool loading = true;

  ApiClient get api => _api;
  String get currency => store?.currency ?? 'USD';

  Future<void> restoreSession() async {
    loading = true;
    notifyListeners();
    final token = await _tokens.read();
    if (token == null || token.isEmpty) {
      user = null;
      store = null;
      loading = false;
      notifyListeners();
      return;
    }
    try {
      final session = await _api.me();
      user = session.user;
      store = session.store;
    } on ApiException catch (error) {
      if (error.statusCode == 401) {
        await _tokens.clear();
        user = null;
        store = null;
      }
    } catch (_) {
      // A network failure must not drop a saved login.
    }
    loading = false;
    notifyListeners();
  }

  Future<void> signIn(String phone, String pin) async {
    final data = await _api.login(phone, pin);
    await _tokens.write(data.token);
    user = data.user;
    store = data.store;
    notifyListeners();
  }

  Future<void> signOut() async {
    await _tokens.clear();
    user = null;
    store = null;
    notifyListeners();
  }
}
