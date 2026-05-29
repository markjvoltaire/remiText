export {
  generateFlightCardImage,
  type FlightCardImage,
  type FlightCardInput,
} from './renderFlightCard.js';
export {
  generateRestaurantCardImage,
  type RestaurantCardImage,
  type RestaurantCardInput,
} from './renderRestaurantCard.js';
export { FlightCard } from './templates/FlightCard.js';
export { RestaurantCard } from './templates/RestaurantCard.js';
export {
  flightCardInputFromHeldOrder,
  flightCardInputFromOffer,
} from './fromDuffel.js';
export { restaurantCardInputFromVenue } from './fromResy.js';

export type PreviewCardRef = {
  kind: 'restaurant' | 'flight';
  optionIndex: number;
  entityId: string;
  label: string;
};

/** Shared attachment shape for iMessage preview cards. */
export type PreviewCardImage = {
  buffer: Buffer;
  contentType: 'image/png';
  ref?: PreviewCardRef;
};
