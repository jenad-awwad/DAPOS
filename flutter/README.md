# DAPOS Flutter

Native Android/iOS client that replaces the Expo app in `mobile/`. It talks to the same DAPOS API.

## Setup

1. Install the [Flutter SDK](https://docs.flutter.dev/get-started/install).
2. From this folder, generate platform projects (once):

```bash
flutter create . --project-name dapos --org com.dapos --platforms android,ios
```

3. Add camera/photo usage text if you use Add Product:

**iOS** `ios/Runner/Info.plist`

- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`

**Android** `android/app/src/main/AndroidManifest.xml`

- `android.permission.CAMERA`

4. Install packages and run:

```bash
flutter pub get
flutter run
```

Point at a local API:

```bash
flutter run --dart-define=API_URL=http://192.168.1.119:3000
```

The default API is `https://dapos-api-production.up.railway.app`.

## What is ported

- Login and session restore (`/auth/login`, `/auth/me`)
- Home dashboard (today’s sales, orders, profit)
- POS with search, barcode lookup, categories, and cart
- Checkout with payment methods
- Products catalog
- Reports
- Add product (managers/admins), including camera/gallery photo
