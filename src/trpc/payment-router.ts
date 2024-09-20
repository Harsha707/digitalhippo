import { z } from "zod";
import { privateProcedure, router } from "./trpc";
import { getPayloadClient } from "../get-payload";
import { stripe } from "../lib/stripe";
import Stripe from "stripe";
import { TRPCError } from "@trpc/server";

export const paymentRouter = router({
  createSession: privateProcedure
    .input(z.object({ productIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { productIds } = input;

      if (productIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const payload = await getPayloadClient();

      const { docs: products } = await payload.find({
        collection: "products",
        where: {
          id: {
            in: productIds,
          },
        },
      });

      const filteredProducts = products.filter((prod) => Boolean(prod.priceId));

const order = await payload.create({
  collection: "orders",
  data: {
    _isPaid: false,
    // Ensure product IDs are all strings
    products: filteredProducts.map((prod) => {
      if (typeof prod.id === 'number') {
        return prod.id.toString(); // Convert number to string
      }
      if (typeof prod.id === 'string') {
        return prod.id; // Return string as is
      }
      throw new Error(`Invalid product id: ${prod.id}`); // Handle any unexpected cases
    }),
    user: user.id,
  },
});


      const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

      filteredProducts.forEach((product) => {
  // Ensure priceId is treated as a string
  if (typeof product.priceId === 'string') {
    line_items.push({
      price: product.priceId, // Correctly typed as string
      quantity: 1,
    });
  } else {
    throw new Error(`Invalid priceId: ${product.priceId}`); // Handle invalid cases
  }
});

      line_items.push({
        price: "price_1Oo4Y0SIsm0zeUEXKRFnFUVm",
        quantity: 1,
        adjustable_quantity: {
          enabled: false,
        },
      });

      try {
        const stripeSession = await stripe.checkout.sessions.create({
          success_url: `${process.env.NEXT_PUBLIC_SERVER_URL}/thank-you?orderId=${order.id}`,
          cancel_url: `${process.env.NEXT_PUBLIC_SERVER_URL}/cart`,
          payment_method_types: ["card"],
          mode: "payment",
          metadata: {
            userId: user.id,
            orderId: order.id,
          },
          line_items,
        });

        return { url: stripeSession.url };
      } catch (err) {
        console.log(err);

        return { url: null };
      }
    }),

  pollOrderStatus: privateProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const { orderId } = input;

      const payload = await getPayloadClient();

      const { docs: orders } = await payload.find({
        collection: "orders",
        where: {
          id: {
            equals: orderId,
          },
        },
      });

      if (!orders.length) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [order] = orders;

      return { isPaid: order._isPaid };
    }),
});
