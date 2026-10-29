import { expect, test } from "@playwright/test";
import { ADMIN } from "./constants.js";

function menuCard(page, price) {
  return page
    .locator("div")
    .filter({ hasText: price })
    .filter({ has: page.getByRole("button", { name: "+", exact: true }) })
    .last();
}

async function startCustomerOrder(page, customerName) {
  await page.goto("/");
  await page.getByPlaceholder("למשל: חיים לוי").fill(customerName);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`הזמנה עבור ${customerName}`)).toBeVisible();
}

async function addBurgerWithToppings(page, toppings) {
  const card = menuCard(page, "₪32");
  for (const topping of toppings) {
    await card.getByText(topping, { exact: true }).click();
  }
  await card.getByRole("button", { name: "+", exact: true }).click();
  await expect(card.getByText("כמות בעגלה: 1")).toBeVisible();
}

async function loginAsAdmin(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "כניסה עם אימייל" }).click();
  await page.getByPlaceholder("אימייל").fill(ADMIN.email);
  await page.getByPlaceholder("סיסמה").fill(ADMIN.password);
  await page.getByRole("button", { name: "התחבר", exact: true }).click();
  await expect(page.getByText(ADMIN.email)).toBeVisible();
}

function cashierOrderCard(page, customerName) {
  return page
    .locator("div")
    .filter({ hasText: customerName })
    .filter({ has: page.getByRole("button", { name: /התקבל תשלום במזומן|שלח למטבח/ }) })
    .last();
}

test("operational screens require admin login", async ({ page }) => {
  await page.goto("/");
  for (const screen of ["קופאי", "מטבח", "דוחות", "משלוחים"]) {
    await page.getByRole("button", { name: screen, exact: true }).click();
    await expect(page.getByText("צריך להתחבר")).toBeVisible();
  }
});

test("pickup order: customer → cashier → kitchen (with toppings) → delivered", async ({ browser }) => {
  const customerName = "דנה פיקאפ";
  const customer = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  await startCustomerOrder(customer, customerName);
  await addBurgerWithToppings(customer, ["בצל", "חסה"]);
  await customer.getByRole("button", { name: "המשך לביצוע הזמנה" }).click();
  await customer.getByRole("button", { name: "מזומן" }).click();
  await customer.getByRole("button", { name: "שלח לקופה" }).click();
  await expect(customer.getByRole("button", { name: "שלח לקופה" })).toBeHidden();

  await loginAsAdmin(admin);
  await admin.getByRole("button", { name: "קופאי", exact: true }).click();
  const card = cashierOrderCard(admin, customerName);
  await card.getByRole("button", { name: /התקבל תשלום במזומן/ }).click();
  await card.getByRole("button", { name: "שלח למטבח" }).click();

  await admin.getByRole("button", { name: "מטבח", exact: true }).click();
  const kitchenItem = admin.getByText("+בצל, חסה");
  await expect(kitchenItem.first()).toBeVisible();

  await admin.getByRole("button", { name: "סיימתי להכין" }).first().click();
  await admin.getByRole("button", { name: "נמסר", exact: true }).first().click();
  await expect(admin.getByRole("button", { name: "סיימתי להכין" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "נמסר", exact: true })).toHaveCount(0);
  // Delivered orders move to the kitchen history table, still showing toppings.
  await expect(kitchenItem.first()).toBeVisible();
});

test("delivery order shows up on the delivery screen and can be dispatched", async ({ browser }) => {
  const customerName = "יוסי משלוח";
  const customer = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  await startCustomerOrder(customer, customerName);
  await addBurgerWithToppings(customer, ["עגבניה"]);
  await customer.getByRole("button", { name: "המשך לביצוע הזמנה" }).click();
  await customer.getByRole("button", { name: "🛵 משלוח" }).click();
  await customer.getByRole("button", { name: "20:00", exact: true }).click();
  await customer.getByPlaceholder("רחוב ומספר בית").fill("הגפן 7");
  await customer.getByRole("button", { name: "אליאב", exact: true }).click();
  await customer.getByPlaceholder("מספר טלפון").fill("0501234567");
  await customer.getByRole("button", { name: "מזומן" }).click();
  await customer.getByRole("button", { name: "שלח לקופה" }).click();
  await expect(customer.getByRole("button", { name: "שלח לקופה" })).toBeHidden();

  await loginAsAdmin(admin);
  await admin.getByRole("button", { name: "משלוחים", exact: true }).click();
  await expect(admin.getByText("הגפן 7").first()).toBeVisible();
  await admin.getByRole("button", { name: "🛵 יצא" }).first().click();
  await expect(admin.getByText(/✅/).first()).toBeVisible();
});
