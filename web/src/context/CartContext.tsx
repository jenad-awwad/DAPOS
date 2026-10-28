import { notifications } from "@mantine/notifications";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Product } from "../lib/types";

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addProduct: (product: Product) => void;
  removeProduct: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setUnitPrice: (productId: string, unitPrice: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function notifyStockShort(name: string, onStock: number, previous: number, next: number) {
  if (next <= onStock || previous > onStock) return;
  notifications.show({
    color: "yellow",
    message: onStock < 1 ? `${name} has no stock` : `${name} has only ${onStock} in stock`,
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addProduct = (product: Product) => {
    const existing = items.find((item) => item.product.id === product.id);
    const previous = existing?.quantity ?? 0;
    const next = previous + 1;
    notifyStockShort(product.name, product.onStock, previous, next);
    setItems((current) => {
      const already = current.find((item) => item.product.id === product.id);
      if (already) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...current, { product, quantity: 1, unitPrice: Number(product.price) || 0 }];
    });
  };

  const removeProduct = (productId: string) => {
    setItems((current) =>
      current.filter((item) => item.product.id !== productId),
    );
  };

  const setQuantity = (productId: string, quantity: number) => {
    const nextQuantity = Number(quantity);
    const next = Math.max(0, Number.isFinite(nextQuantity) ? nextQuantity : 1);
    const existing = items.find((item) => item.product.id === productId);
    if (existing) notifyStockShort(existing.product.name, existing.product.onStock, existing.quantity, next);
    setItems((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) return item;
          return { ...item, quantity: next };
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const setUnitPrice = (productId: string, unitPrice: number) => {
    const nextPrice = Number(unitPrice);
    setItems((current) =>
      current.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              unitPrice: Math.max(0, Number.isFinite(nextPrice) ? nextPrice : 0),
            }
          : item,
      ),
    );
  };

  const clear = () => setItems([]);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  const value = useMemo(
    () => ({
      items,
      itemCount,
      subtotal,
      addProduct,
      removeProduct,
      setQuantity,
      setUnitPrice,
      clear,
    }),
    [items, itemCount, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
