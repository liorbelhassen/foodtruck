import { expect, test } from "@playwright/test";
import { ADMIN } from "./constants.js";

async function startCustomerOrder(page) {
  await page.goto("/");
  await expect(page.getByText("הזמנה עצמית")).toBeVisible();
}

async function addBurgerWithToppings(page, toppings) {
  await page.getByRole("button", { name: /₪35/ }).click();
  const sheet = page.getByRole("dialog");
  for (const topping of toppings) {
    await sheet.getByRole("button", { name: topping, exact: true }).click();
  }
  await sheet.getByRole("button", { name: /הוספה להזמנה/ }).click();
  await expect(page.getByText("✓ 1 בהזמנה")).toBeVisible();
}

async function submitOrder(page, customerName) {
  await page.getByPlaceholder("השם שיופיע על ההזמנה").fill(customerName);
  await page.getByRole("button", { name: /המשך לתשלום/ }).click();
  await page.getByRole("button", { name: "מזומן", exact: true }).click();
  await page.getByRole("button", { name: /שליחת הזמנה/ }).click();
  await expect(page.getByRole("button", { name: /שליחת הזמנה/ })).toBeHidden();
}

async function loginAsAdmin(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: "כניסת צוות" }).click();
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

test("operational screens are hidden from customers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("הזמנה עצמית")).toBeVisible();
  for (const screen of ["קופאי", "מטבח", "דוחות", "משלוחים", "מלאי"]) {
    await expect(page.getByRole("button", { name: screen, exact: true })).toHaveCount(0);
  }
});

test("pickup order: customer → cashier → kitchen (with toppings) → delivered", async ({ browser }) => {
  const customerName = "דנה פיקאפ";
  const customer = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  await startCustomerOrder(customer);
  await addBurgerWithToppings(customer, ["בצל", "חסה"]);
  await customer.getByRole("button", { name: /המשך לאיסוף/ }).click();
  await submitOrder(customer, customerName);

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
  // Delivered orders move to the kitchen history view, still showing toppings.
  await admin.getByRole("button", { name: /^נמסרו/ }).click();
  await expect(kitchenItem.first()).toBeVisible();
});

test("delivery order shows up on the delivery screen and can be dispatched", async ({ browser }) => {
  const customerName = "יוסי משלוח";
  const customer = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  await startCustomerOrder(customer);
  await addBurgerWithToppings(customer, ["עגבניה"]);
  await customer.getByRole("button", { name: /המשך לאיסוף/ }).click();
  await customer.getByRole("button", { name: "🛵 משלוח" }).click();
  await customer.getByRole("button", { name: /20:00/ }).click();
  await customer.getByPlaceholder("רחוב ומספר בית").fill("הגפן 7");
  await customer.getByRole("button", { name: /אליאב/ }).click();
  await customer.getByPlaceholder("לדוגמה 050-1234567").fill("0501234567");
  await submitOrder(customer, customerName);

  await loginAsAdmin(admin);
  await admin.getByRole("button", { name: "משלוחים", exact: true }).click();
  await expect(admin.getByText("הגפן 7").first()).toBeVisible();
  await admin.getByRole("button", { name: "🛵 יצא" }).first().click();
  await expect(admin.getByText(/✅/).first()).toBeVisible();
});
