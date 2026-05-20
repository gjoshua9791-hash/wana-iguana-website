export const menu = [
  {
    category: "Original Tacos",
    note: "Served with chips",
    items: [
      {
        name: "Taco Suave",
        description: "Soft corn tortilla with choice of steak or chicken with lettuce, cheese, and pico de gallo.",
        popular: true,
        price: "$5.25",
        image: "/images/taco-suave.jpeg"
      },
      {
        name: "Taco Duro",
        description: "Crispy shell corn tortilla with choice of shredded beef or shredded chicken with cheese, lettuce, and our special tomato sauce. (Meat substitutions not allowed)",
        price: "$5.25",
        popular: true,
      },
      {
        name: "Taco Bravo",
        description: "Choice of steak or chicken, beans, avocado, and our spicy bravo salsa.",
        price: "$5.25",
      },
      {
        name: "Taco Del Mar",
        description: "Choice of grilled fish (tilapia) or grilled shrimp with cabbage, pico de gallo, and our special white sauce.",
        price: "$6.75",
      },
      {
        name: "Taco Supreme",
        description: "Large crispy flour tortilla with choice of shredded beef or grilled chicken with lettuce, cheese, sour cream, and guacamole.",
        price: "$8.50",
      },
    ],
  },
  {
    category: "Burritos",
    note: "Served with chips",
    items: [
      {
        name: "Fajita Burrito",
        description: "Grilled fajita style steak or chicken with grilled peppers, onions, and zucchini cooked in our special tomato sauce.",
        price: "$15.49",
      },
      {
        name: "Super Burrito",
        description: "Shredded beef, beans, cheese, pico de gallo, guacamole, and sour cream.",
        price: "$13.49",
        popular: true,
      },
      {
        name: "Burrito Grande",
        description: "Steak or chicken with rice, beans, cheese, and pico de gallo.",
        price: "$13.49",
        popular: true,
      },
      {
        name: "Bravo Burrito",
        description: "Steak or chicken with beans, avocado, cheese, and our spicy bravo salsa.",
        price: "$13.49",
      },
      {
        name: "Burrito Del Mar",
        description: "Grilled shrimp with rice, tomatoes, cheese, and slices of avocado.",
        price: "$15.99",
        popular: true,
      },
      {
        name: "Grilled Fish Burrito",
        description: "Grilled fish (tilapia) with rice, cabbage, and our special white sauce.",
        price: "$15.99",
      },
      {
        name: "Classic Burrito",
        description: "Rice, beans, and cheese.",
        price: "$9.29",
      },
      {
        name: "Wet Burrito Add On",
        description: "Add to any burrito to make it a wet burrito. Topped with our special red sauce and melted cheese.",
        price: "$4.29",
      },
    ],
  },
  {
    category: "Favorites",
    items: [
      {
        name: "Shrimp Cocktail",
        description: "18 shrimp, avocado slices, pico de gallo, and lots of lemon.",
        price: "$22.99",
      },
      {
        name: "Fajitas",
        description: "Grilled fajita style steak or chicken, served with rice and beans, with sides of guacamole, sour cream, and pico de gallo. With shrimp: $22.49.",
        price: "$18.99",
      },
      {
        name: "Chimichanga",
        description: "Two crispy rolled flour tortillas filled with shredded beef or shredded chicken cut in half, then topped with guacamole, sour cream, and pico de gallo.",
        price: "$13.49",
      },
      {
        name: "Taquitos",
        description: "Three crispy rolled corn tortillas filled with shredded beef or shredded chicken, with sides of guacamole and pico de gallo. (Meat substitutions not allowed)",
        price: "$10.49",
      },
      {
        name: "Quesadilla Deluxe",
        description: "Choice of one flour tortilla or two corn tortillas with melted cheese, with sides of guacamole, sour cream, and pico de gallo. Chicken or steak add on is $2.99.",
        price: "$10.49",
        popular: true,
      },
      {
        name: "Quesadilla Supreme",
        description: "Wheat tortilla filled with melted cheese, grilled peppers, onions, zucchini, and beans. Comes with sides of guacamole, sour cream, and pico de gallo. Chicken or steak add on is $2.99.",
        price: "$13.49",
      },
      {
        name: "Mexican Nachos",
        description: "Crispy corn tortilla chips with melted cheese, beans, guacamole, and sour cream. Chicken or steak add on is $2.99.",
        price: "$11.99",
        popular: true,
      },
      {
        name: "Chicken Nachos",
        description: "Crispy corn tostadas made with chicken, beans, melted cheese, topped with guacamole, sour cream, and pico de gallo.",
        price: "$14.49",
      },
      {
        name: "Torta",
        description: "Steak or chicken on toasted Mexican bread with beans, lettuce, guacamole, and chopped tomato.",
        price: "$11.99",
      },
    ],
  },
  {
    category: "Kids Menu",
    note: "Includes sides of rice, beans, and a soda",
    items: [
      {
        name: "#1 Mini Taco",
        description: "Choice of steak or chicken. Taco comes with lettuce, cheese, and pico de gallo.",
        price: "$9.99",
      },
      {
        name: "#2 Two Taquitos",
        description: "Choice of shredded beef or shredded chicken.",
        price: "$9.99",
      },
      {
        name: "#3 Mini Cheese Quesadilla",
        description: "Chicken or steak add on is $1.99.",
        price: "$9.99",
      },
      {
        name: "#4 Bean and Cheese Burrito",
        description: "Chicken or steak add on is $1.99.",
        price: "$9.99",
      },
    ],
  },
  {
    category: "Combinations",
    note: "Served with rice, beans, and chips",
    items: [
      {
        name: "#1 One Taco",
        description: "Choice of one Suave or Duro taco.",
        price: "$9.25",
      },
      {
        name: "#2 Two Tacos",
        description: "Choice of two Suave or Duro tacos. Feel free to mix and match.",
        price: "$14.50",
        popular: true,
      },
      {
        name: "#3 One Enchilada",
        description: "One cheese enchilada with red sauce. Shredded beef or shredded chicken add on is $1.50.",
        price: "$9.25",
      },
      {
        name: "#4 Two Enchiladas",
        description: "Two cheese enchiladas with red sauce. Shredded beef or shredded chicken add on is $2.99.",
        price: "$14.50",
        popular: true,
      },
      {
        name: "#5 Burrito",
        description: "Choice of Super Burrito or Burrito Grande.",
        price: "$15.99",
      },
      {
        name: "#6 Taco and Enchilada",
        description: "Choice of a Duro taco or Suave taco with a cheese enchilada with red sauce. Shredded beef or shredded chicken add on to enchilada is $1.50.",
        price: "$14.99",
        popular: true,
      },
      {
        name: "#7 Taco and Burrito",
        description: "Choice of a Super Burrito or Grande Burrito with a Duro taco or Suave taco.",
        price: "$20.99",
      },
      {
        name: "#8 Taquito Combo",
        description: "Three crispy rolled corn tortillas filled with beef or chicken with a side of guacamole.",
        price: "$13.49",
      },
    ],
  },
  {
    category: "Health Mex",
    note: "Served with chips",
    items: [
      {
        name: "Tostada Supreme",
        description: "Large crispy flour tortilla shell filled with steak or chicken, beans, lettuce, guacamole, sour cream, cheese, and pico de gallo. With shrimp: $16.49.",
        price: "$13.99",
        popular: true,
      },
      {
        name: "Chicken Salad",
        description: "Bed of lettuce, grilled chicken, avocado slices, tomatoes, bell pepper, and corn tortilla strips.",
        price: "$13.49",
      },
      {
        name: "Avocado Burrito",
        description: "Avocado slices, rice, beans, cheese, pico de gallo, and sour cream in a wheat tortilla.",
        price: "$13.49",
        popular: true,
      },
      {
        name: "Grilled Veggie Burrito",
        description: "Grilled peppers, onions, and zucchini with rice, beans, and guacamole in a wheat tortilla.",
        price: "$12.99",
      },
    ],
  },
    {
    category: "Wana Breakfasts",
    note: "Served All Day, Everyday",
    items: [
      {
        name: "Chilaquiles",
        description: "Tortilla chips covered in red sauce, topped with 2 scrambled eggs and cheese, with a side of beans and rice.",
        price: "$13.49",
      },
      {
        name: "Ham and Egg Burrito",
        description: "2 scrambled eggs, ham, potatoes, rice, beans, and cheese.",
        price: "$13.49",
      },
      {
        name: "Chorizo and Egg Burrito",
        description: "2 scrambled eggs, chorizo, potatoes, rice, beans, and cheese.",
        price: "$13.49",
      },
      {
        name: "Machaca Burrito",
        description: "2 scrambled eggs, shredded beef, pico de gallo, rice, beans, and cheese.",
        price: "$13.49",
      },
      {
        name: "Papas and Egg Burrito",
        description: "2 scrambled eggs, potatoes, red salsa, rice, beans, and cheese.",
        price: "$13.49",
      },
      {
        name: "Bacon and Egg Burrito",
        description: "2 scrambled eggs, bacon, potatoes, rice, beans, and cheese.",
        price: "$13.49",
      },
    ],
  },
  {
    category: "Wana Specials",
    items: [
      {
        name: "Mexican Chopped Salad",
        description: "Steak or chicken, romaine lettuce, tomatoes, cucumber, cheese, chips, and avocado.",
        price: "$13.49",
      },
      {
        name: "Monster Diabla Burrito",
        description: "Shrimp, lettuce, tomatoes, onions, and rice, covered in our spicy diabla salsa, topped with sliced avocado, with a side of chips.",
        price: "$22.99",
      },
      {
        name: "Ranch Chicken Wrap",
        description: "Chicken, avocado, lettuce, pico de gallo, and ranch dressing all on a wheat tortilla.",
        price: "$13.49",
      },
      {
        name: "Chicken Tortilla Soup",
        description: "Chips, chicken, veggies, avocado, cheese, and a side of sour cream.",
        price: "$13.49",
        popular: true,
      },
      {
        name: "Carnitas Burrito",
        description: "Carnitas, beans, pico de gallo, and avocado, with green salsa.",
        price: "$13.49",
      },
      {
        name: "Grilled Chicken Veggie Salad",
        description: "Romaine lettuce, grilled bell peppers, onions, zucchini, corn, tomato, and cheese.",
        price: "$13.49",
      },
      {
        name: "One Ceviche Tostada",
        description: "Marinated fish (tilapia), pico de gallo, and avocado.",
        price: "$5.49",
      },
      {
        name: "Street Tacos",
        description: "3 mini tacos, choice of steak, chicken, or carnitas with cilantro and onions.",
        price: "$10.49",
        popular: true,
      },
      {
        name: "Iguana Fries",
        description: "Fries, choice of meat (Steak, Chicken, or Carnitas), beans, cheese, all topped with guacamole, sour cream, and pico de gallo.",
        price: "$13.49",
      },
    ],
  },
  {
    category: "Side Orders",
    items: [
      {
        name: "8oz Homemade Guacamole Dip and Chips",
        price: "$11.99",
        popular: true,
      },
      {
        name: "8oz Fresh Salsa with Chips",
        price: "$9.49",
      },
      {
        name: "8oz Rice or Beans",
        price: "$4.50",
      },
      {
        name: "Half & Half of Rice and Beans",
        price: "$4.50",
      },
      {
        name: "Mexican Flan",
        price: "$5.25",
      },
      {
        name: "Green Salad",
        price: "$6.99",
      },
      {
        name: "8oz Salsa",
        price: "$3.99",
      },
      {
        name: "32oz Salsa",
        price: "$15.99",
      },
      {
        name: "32oz Guacamole",
        price: "$26.99",
      },
      {
        name: "32oz Rice or Beans",
        price: "$17.99",
      },
      {
        name: "8oz Guacamole",
        price: "$6.50",
      },
    ],
  },
  {
    category: "Drinks",
    items: [
      {
        name: "Pepsi",
        price: "$3.29",
      },
      {
        name: "Pepsi Zero Sugar",
        price: "$3.29",
      },
      {
        name: "Dr Pepper",
        price: "$3.29",
      },
      {
        name: "Crush Orange",
        price: "$3.29",
      },
      {
        name: "Starry",
        price: "$3.29",
      },
      {
        name: "Pink Lemonade",
        price: "$3.29",
      },
      {
        name: "Raspberry Iced Tea",
        price: "$3.29",
      },
      {
        name: "Unsweetened Iced Tea",
        price: "$3.29",
      },
      {
        name: "Horchata",
        price: "$3.29",
      },
      {
        name: "Jamaica",
        price: "$3.29",
      },
      {
        name: "Orange Bang Juice",
        price: "$3.29",
      },
      {
        name: "Gatorade",
        price: "$3.99",
      },
      {
        name: "Bottled Water",
        price: "$2.49",
      },
      {
        name: "Jarritos",
        price: "$3.99",
      },
    ],
  },
  {
    category: "Beer",
    note: "Available only for dine in.",
    items: [
      {
        name: "Corona",
        price: "$6.99",
      },
      {
        name: "Modelo",
        price: "$6.99",
      },
      {
        name: "Pacifico",
        price: "$6.99",
      },
      {
        name: "Heineken",
        price: "$6.99",
      },
      {
        name: "Coors Light",
        price: "$5.99",
      },
    ],
  },
  
];