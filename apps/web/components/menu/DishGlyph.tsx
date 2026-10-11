"use client";
import { Coffee, CupSoda, Wine, Beer, Milk, Citrus, IceCreamBowl, CakeSlice, Cookie, Croissant, Soup, Salad, Pizza, Sandwich, Beef, Drumstick, Fish, EggFried, Wheat, Carrot, Popcorn, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";

/** The outline drawing a dish wears until it has a photo: picked from its name first, then its
 *  category — a coffee gets a cup, a biryani a bowl, a naan the bread. Words are matched at the
 *  start of a word, so "rice" finds "Ghee rice" and not "price". Nothing matched: the plate. */
const RULES: [RegExp, LucideIcon][] = [
  [/\b(coffee|espresso|cappuccino|latte|filter kaapi|kaapi)/i, Coffee],
  [/\b(tea|chai)\b/i, Coffee],
  [/\b(lassi|milkshake|shake|milk|badam)/i, Milk],
  [/\b(lime|lemon|nimbu|juice|mojito|orange)/i, Citrus],
  [/\b(soda|cola|drink|beverage|mocktail|cooler|water)/i, CupSoda],
  [/\b(wine)/i, Wine], [/\b(beer|ale|lager)/i, Beer],
  [/\b(ice cream|kulfi|sundae|falooda)/i, IceCreamBowl],
  [/\b(cake|pastry|brownie|dessert|sweet|halwa|jamun|payasam|kheer|rasmalai|rasgulla)/i, CakeSlice],
  [/\b(cookie|biscuit)/i, Cookie],
  [/\b(naan|roti|chapati|paratha|parotta|kulcha|bread|appam|puri|bhatura|croissant)/i, Croissant],
  [/\b(soup|shorba|rasam|stew|kuzhambu|sambar|curry|masala|gravy|dal|korma)/i, Soup],
  [/\b(salad|kachumber|raita|sprout)/i, Salad],
  [/\b(pizza)/i, Pizza], [/\b(sandwich|burger|wrap|roll|frankie|sub)\b/i, Sandwich],
  [/\b(fish|meen|prawn|shrimp|crab|seafood|squid|thokku)/i, Fish],
  [/\b(chicken|65|tandoori|tikka|kebab|wings|drumstick)/i, Drumstick],
  [/\b(mutton|lamb|beef|keema|ghosh|gosht|pork)/i, Beef],
  [/\b(egg|omelette|omelet|bhurji)/i, EggFried],
  [/\b(rice|biryani|briyani|pulao|pongal|khichdi|meals|thali|noodles|fried rice)/i, Wheat],
  [/\b(dosa|idli|vada|uttapam|upma|tiffin|pakoda|pakora|bajji|samosa|chaat|snack|starter|fries|chips)/i, Popcorn],
  [/\b(paneer|gobi|aloo|veg|vegetable|manchurian|mushroom|bhindi|palak)/i, Carrot],
];
export function glyphFor(name: string, category?: string | null): LucideIcon {
  return RULES.find(([re]) => re.test(name))?.[1] ?? (category ? RULES.find(([re]) => re.test(category))?.[1] : undefined) ?? UtensilsCrossed;
}

/** The drawing on a soft tile in the veg/non-veg tint, the size of the box it fills. */
export function DishGlyph({ name, category, veg, size = 26, className }: { name: string; category?: string | null; veg?: boolean; size?: number; className?: string }) {
  const Icon = glyphFor(name, category);
  return (
    <span className={cn("h-full w-full grid place-items-center", veg === false ? "bg-[color-mix(in_srgb,var(--color-red)_10%,var(--color-bg-3))] text-[color-mix(in_srgb,var(--color-red)_70%,var(--color-label-2))]" : "bg-[color-mix(in_srgb,var(--color-green)_10%,var(--color-bg-3))] text-[color-mix(in_srgb,var(--color-green)_70%,var(--color-label-2))]", className)} data-glyph>
      <Icon size={size} strokeWidth={1.5} aria-hidden />
    </span>
  );
}
