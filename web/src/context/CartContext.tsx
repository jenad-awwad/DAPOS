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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addProduct = (product: Product) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.onStock) return current;
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      if (product.onStock < 1) return current;
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
    setItems((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) return item;
          const next = Math.max(
            0,
            Math.min(Number.isFinite(nextQuantity) ? nextQuantity : 1, item.product.onStock),
          );
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
