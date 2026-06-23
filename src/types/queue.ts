export interface FulfillmentQueueMessage {
  deliveryId: string;
  eventId: string;
  paymentOrderId: string;
  appId: string;
  attemptNumber: number;
}