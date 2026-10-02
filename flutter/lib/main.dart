import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_router.dart';
import 'state/auth_state.dart';
import 'state/cart_state.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DaposApp());
}

class DaposApp extends StatefulWidget {
  const DaposApp({super.key});

  @override
  State<DaposApp> createState() => _DaposAppState();
}

class _DaposAppState extends State<DaposApp> {
  final _auth = AuthState();
  late final _router = createRouter(_auth);

  @override
  void initState() {
    super.initState();
    _auth.restoreSession();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _auth),
        ChangeNotifierProvider(create: (_) => CartState()),
      ],
      child: MaterialApp.router(
        title: 'DAPOS',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        routerConfig: _router,
        builder: (context, child) {
          return ListenableBuilder(
            listenable: _auth,
            builder: (context, _) {
              if (_auth.loading) return const SplashView();
              return child ?? const SizedBox.shrink();
            },
          );
        },
      ),
    );
  }
}
