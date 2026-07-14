/**
 * Shared achievement evaluator for CRM Loyalty system.
 * Used by both the ETL script and the API endpoints.
 */

function evaluateAchievements(memberId, profile, summaries) {
  const achievements = [];

  // 1. Ultimate Explorer: Bought items from >= 10 different stores (org_cd)
  const uniqueStores = new Set(summaries.map(s => s.org_cd));
  if (uniqueStores.size >= 10) {
    achievements.push({
      name: 'Ultimate Explorer',
      criteria: `Visited ${uniqueStores.size} different stores: ${Array.from(uniqueStores).join(', ')}`
    });
  }

  // Helper stats for category-based achievements
  let totalAlcoholQty = 0;
  let totalAlcoholSales = 0;
  let totalFruitQty = 0;
  let totalVegQty = 0;
  let totalCoffeeQty = 0;
  let totalSeafoodQty = 0;
  let totalMeatQty = 0;
  let totalBabyQty = 0;
  let weekendTxn = 0;
  let totalPromoDiscount = 0;

  for (const s of summaries) {
    let cats = [];
    try {
      cats = JSON.parse(s.categories_bought || '[]');
    } catch (e) {
      if (s.categories_bought) {
        cats = s.categories_bought.split(',').map(c => c.trim());
      }
    }

    // Weekend check: Saturday (6) or Sunday (0)
    const day = new Date(s.summary_date).getDay();
    if (day === 0 || day === 6) {
      weekendTxn += s.total_txn;
    }

    totalPromoDiscount += s.total_promo;

    // Check categories bought
    cats.forEach(c => {
      const gName = c.group_name?.toUpperCase() || '';
      const dName = c.div_name?.toUpperCase() || '';
      const qty = c.qty || 0;
      const sales = c.sales || 0;

      if (dName === 'LIQUOR' || gName.includes('ALCOHOL') || gName.includes('WINE') || gName.includes('BEER')) {
        totalAlcoholQty += qty;
        totalAlcoholSales += sales;
      }
      if (gName.includes('FRUIT')) {
        totalFruitQty += qty;
      }
      if (gName.includes('VEGETABLE')) {
        totalVegQty += qty;
      }
      if (gName.includes('COFFEE')) {
        totalCoffeeQty += qty;
      }
      if (gName.includes('SEAFOOD') || gName.includes('FISH')) {
        totalSeafoodQty += qty;
      }
      if (gName.includes('MEAT') || gName.includes('POULTRY') || gName.includes('BEEF') || gName.includes('PORK')) {
        totalMeatQty += qty;
      }
      if (gName.includes('BABY') || gName.includes('DIAPER')) {
        totalBabyQty += qty;
      }
    });
  }

  // 2. Alcohol Enthusiast
  if (totalAlcoholQty >= 5 || totalAlcoholSales >= 500000) {
    achievements.push({
      name: 'Alcohol Enthusiast',
      criteria: `Purchased ${totalAlcoholQty} alcohol items, total spent: Rp ${totalAlcoholSales.toLocaleString('id-ID')}`
    });
  }

  // 3. Fruit Lover
  if (totalFruitQty >= 10) {
    achievements.push({
      name: 'Fruit Lover',
      criteria: `Purchased ${totalFruitQty} fruit items`
    });
  }

  // 4. Vegetable Lover
  if (totalVegQty >= 10) {
    achievements.push({
      name: 'Vegetable Lover',
      criteria: `Purchased ${totalVegQty} vegetable items`
    });
  }

  // 5. Coffee Addict
  if (totalCoffeeQty >= 10) {
    achievements.push({
      name: 'Coffee Addict',
      criteria: `Purchased ${totalCoffeeQty} coffee items`
    });
  }

  // 6. Seafood Hunter
  if (totalSeafoodQty >= 5) {
    achievements.push({
      name: 'Seafood Hunter',
      criteria: `Purchased ${totalSeafoodQty} seafood items`
    });
  }

  // 7. Meat Lover
  if (totalMeatQty >= 10) {
    achievements.push({
      name: 'Meat Lover',
      criteria: `Purchased ${totalMeatQty} meat items`
    });
  }

  // 8. Baby Care Hero
  if (totalBabyQty >= 5) {
    achievements.push({
      name: 'Baby Care Hero',
      criteria: `Purchased ${totalBabyQty} baby care items`
    });
  }

  // Compute filtered profile stats from summaries
  let filteredSpent = 0;
  let filteredTxn = 0;
  summaries.forEach(s => {
    filteredSpent += s.total_sales;
    filteredTxn += s.total_txn;
  });

  // 9. Big Spender: Total spent >= 5,000,000 IDR
  if (filteredSpent >= 5000000) {
    achievements.push({
      name: 'Big Spender',
      criteria: `Spent a total of Rp ${filteredSpent.toLocaleString('id-ID')} (> Rp 5,000,000)`
    });
  }

  // 10. Premium Shopper: Avg basket >= 1,000,000 IDR and txn >= 3
  const avgBasket = filteredSpent / (filteredTxn || 1);
  if (avgBasket >= 1000000 && filteredTxn >= 3) {
    achievements.push({
      name: 'Premium Shopper',
      criteria: `Avg basket value Rp ${Math.round(avgBasket).toLocaleString('id-ID')} with ${filteredTxn} transactions`
    });
  }

  // 11. Frequent Shopper: Total transactions >= 20
  if (filteredTxn >= 20) {
    achievements.push({
      name: 'Frequent Shopper',
      criteria: `Total transactions: ${filteredTxn}`
    });
  }

  // 12. Weekend Shopper: Total txn on weekends >= 10
  if (weekendTxn >= 10) {
    achievements.push({
      name: 'Weekend Shopper',
      criteria: `Completed ${weekendTxn} transactions during weekends`
    });
  }

  // 13. Promo Hunter: Total promo >= 20% of sales
  if (totalPromoDiscount >= (filteredSpent * 0.20) && totalPromoDiscount > 0) {
    achievements.push({
      name: 'Promo Hunter',
      criteria: `Saved Rp ${totalPromoDiscount.toLocaleString('id-ID')} from promos, which is ${Math.round(totalPromoDiscount / (filteredSpent || 1) * 100)}% of total spent`
    });
  }

  return achievements;
}

module.exports = { evaluateAchievements };
