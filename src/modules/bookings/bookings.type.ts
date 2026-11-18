import { Occupancy } from "@/lib/liteapi/liteapi.type.js";

export type BookingHotelSnapshot = {
    hotelPhotoUrl: string | null;
    hotelAddress: string;
};

export type OccupancyComparison = {
    requested: Occupancy;
    confirmed: Occupancy;
};
