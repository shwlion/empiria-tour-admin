export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          occurred_at?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
          occurred_at?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_acknowledgements: {
        Row: {
          accepted_at: string
          block_id: string | null
          body_snapshot: string
          booking_id: string
          id: string
          ip_address: unknown
          label: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          block_id?: string | null
          body_snapshot: string
          booking_id: string
          id?: string
          ip_address?: unknown
          label: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          block_id?: string | null
          body_snapshot?: string
          booking_id?: string
          id?: string
          ip_address?: unknown
          label?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_acknowledgements_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "disclosure_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_acknowledgements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_documents: {
        Row: {
          booking_id: string
          created_at: string
          filename: string
          id: string
          kind: string
          storage_path: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          filename: string
          id?: string
          kind: string
          storage_path: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          filename?: string
          id?: string
          kind?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_holds: {
        Row: {
          booking_id: string | null
          created_at: string
          departure_id: string
          expires_at: string
          id: string
          released_at: string | null
          seats: number
          session_token: string
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          departure_id: string
          expires_at: string
          id?: string
          released_at?: string | null
          seats: number
          session_token: string
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          departure_id?: string
          expires_at?: string
          id?: string
          released_at?: string | null
          seats?: number
          session_token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_price_lines: {
        Row: {
          amount_cents: number
          booking_id: string
          extra_id: string | null
          id: string
          kind: string
          label: string
          quantity: number
          sort_order: number
          unit_cents: number
        }
        Insert: {
          amount_cents: number
          booking_id: string
          extra_id?: string | null
          id?: string
          kind: string
          label: string
          quantity?: number
          sort_order?: number
          unit_cents: number
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          extra_id?: string | null
          id?: string
          kind?: string
          label?: string
          quantity?: number
          sort_order?: number
          unit_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "package_extras"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          amount_paid_cents: number
          balance_cents: number | null
          balance_due_on: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_session_ref: string | null
          children: number
          created_at: string
          currency: string
          departure_id: string
          deposit_due_cents: number
          discount_cents: number
          fees_cents: number
          fx_rate_to_base: number | null
          id: string
          infants: number
          lead_address: Json | null
          lead_email: string
          lead_name: string
          lead_phone: string | null
          notes_internal: string | null
          package_id: string
          promotion_id: string | null
          reference: string
          room_type_id: string | null
          single_supplement: boolean
          status: string
          subtotal_cents: number
          supplier_cost_base_cents: number | null
          supplier_cost_cents: number | null
          tax_cents: number
          total_base_cents: number | null
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adults?: number
          amount_paid_cents?: number
          balance_cents?: number | null
          balance_due_on?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_session_ref?: string | null
          children?: number
          created_at?: string
          currency?: string
          departure_id: string
          deposit_due_cents?: number
          discount_cents?: number
          fees_cents?: number
          fx_rate_to_base?: number | null
          id?: string
          infants?: number
          lead_address?: Json | null
          lead_email: string
          lead_name: string
          lead_phone?: string | null
          notes_internal?: string | null
          package_id: string
          promotion_id?: string | null
          reference?: string
          room_type_id?: string | null
          single_supplement?: boolean
          status?: string
          subtotal_cents?: number
          supplier_cost_base_cents?: number | null
          supplier_cost_cents?: number | null
          tax_cents?: number
          total_base_cents?: number | null
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adults?: number
          amount_paid_cents?: number
          balance_cents?: number | null
          balance_due_on?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_session_ref?: string | null
          children?: number
          created_at?: string
          currency?: string
          departure_id?: string
          deposit_due_cents?: number
          discount_cents?: number
          fees_cents?: number
          fx_rate_to_base?: number | null
          id?: string
          infants?: number
          lead_address?: Json | null
          lead_email?: string
          lead_name?: string
          lead_phone?: string | null
          notes_internal?: string | null
          package_id?: string
          promotion_id?: string | null
          reference?: string
          room_type_id?: string | null
          single_supplement?: boolean
          status?: string
          subtotal_cents?: number
          supplier_cost_base_cents?: number | null
          supplier_cost_cents?: number | null
          tax_cents?: number
          total_base_cents?: number | null
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          description: string | null
          hero_image: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          status: string
        }
        Insert: {
          description?: string | null
          hero_image?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          status?: string
        }
        Update: {
          description?: string | null
          hero_image?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: string
        }
        Relationships: []
      }
      collections: {
        Row: {
          description: string | null
          hero_image: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          status: string
        }
        Insert: {
          description?: string | null
          hero_image?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          status?: string
        }
        Update: {
          description?: string | null
          hero_image?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          is_default: boolean
          name: string
          sort_order: number
          status: string
          symbol: string
        }
        Insert: {
          code: string
          is_default?: boolean
          name: string
          sort_order?: number
          status?: string
          symbol: string
        }
        Update: {
          code?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          status?: string
          symbol?: string
        }
        Relationships: []
      }
      custom_field_responses: {
        Row: {
          booking_id: string
          field_id: string
          id: string
          traveller_id: string | null
          value: string | null
        }
        Insert: {
          booking_id: string
          field_id: string
          id?: string
          traveller_id?: string | null
          value?: string | null
        }
        Update: {
          booking_id?: string
          field_id?: string
          id?: string
          traveller_id?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_responses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "package_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_responses_traveller_id_fkey"
            columns: ["traveller_id"]
            isOneToOne: false
            referencedRelation: "travellers"
            referencedColumns: ["id"]
          },
        ]
      }
      departure_prices: {
        Row: {
          base_price_cents: number
          child_price_cents: number | null
          currency: string
          departure_id: string
        }
        Insert: {
          base_price_cents: number
          child_price_cents?: number | null
          currency: string
          departure_id: string
        }
        Update: {
          base_price_cents?: number
          child_price_cents?: number | null
          currency?: string
          departure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departure_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "departure_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["currency"]
          },
          {
            foreignKeyName: "departure_prices_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
        ]
      }
      departures: {
        Row: {
          capacity: number
          child_price_override_cents: number | null
          created_at: string
          ends_on: string | null
          id: string
          package_id: string
          price_override_cents: number | null
          sales_close_at: string | null
          sales_open_at: string | null
          seats_booked: number
          seats_held: number
          start_time: string | null
          starts_on: string
          status: string
        }
        Insert: {
          capacity: number
          child_price_override_cents?: number | null
          created_at?: string
          ends_on?: string | null
          id?: string
          package_id: string
          price_override_cents?: number | null
          sales_close_at?: string | null
          sales_open_at?: string | null
          seats_booked?: number
          seats_held?: number
          start_time?: string | null
          starts_on: string
          status?: string
        }
        Update: {
          capacity?: number
          child_price_override_cents?: number | null
          created_at?: string
          ends_on?: string | null
          id?: string
          package_id?: string
          price_override_cents?: number | null
          sales_close_at?: string | null
          sales_open_at?: string | null
          seats_booked?: number
          seats_held?: number
          start_time?: string | null
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "departures_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "departures_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          created_at: string
          description: string | null
          hero_image: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          name: string
          parent_id: string | null
          path: string
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hero_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          name: string
          parent_id?: string | null
          path: string
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hero_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          parent_id?: string | null
          path?: string
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_blocks: {
        Row: {
          body: string
          id: string
          name: string
          requires_acknowledgement: boolean
          slug: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          id?: string
          name: string
          requires_acknowledgement?: boolean
          slug: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          id?: string
          name?: string
          requires_acknowledgement?: boolean
          slug?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disclosure_blocks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_placements: {
        Row: {
          block_id: string
          id: string
          package_id: string | null
          placement: string
          sort_order: number
        }
        Insert: {
          block_id: string
          id?: string
          package_id?: string | null
          placement: string
          sort_order?: number
        }
        Update: {
          block_id?: string
          id?: string
          package_id?: string | null
          placement?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "disclosure_placements_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "disclosure_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disclosure_placements_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "disclosure_placements_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attempts: number
          body_snapshot: string | null
          booking_id: string | null
          created_at: string
          dedupe_key: string | null
          departure_id: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          merge_data: Json
          provider: string
          provider_ref: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject_snapshot: string | null
          template_key: string
          to_email: string
          to_name: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body_snapshot?: string | null
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          departure_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          merge_data?: Json
          provider?: string
          provider_ref?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject_snapshot?: string | null
          template_key: string
          to_email: string
          to_name?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body_snapshot?: string | null
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          departure_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          merge_data?: Json
          provider?: string
          provider_ref?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject_snapshot?: string | null
          template_key?: string
          to_email?: string
          to_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "email_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          is_active: boolean
          key: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          is_active?: boolean
          key: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          is_active?: boolean
          key?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      itinerary_days: {
        Row: {
          description: string | null
          id: string
          image: string | null
          package_id: string
          position: number
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          image?: string | null
          package_id: string
          position: number
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          image?: string | null
          package_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "itinerary_days_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_collections: {
        Row: {
          collection_id: string
          package_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          package_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          package_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_collections_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "package_collections_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_custom_fields: {
        Row: {
          applies_to: string
          field_type: string
          id: string
          is_required: boolean
          key: string
          label: string
          options: string[] | null
          package_id: string
          sort_order: number
        }
        Insert: {
          applies_to?: string
          field_type: string
          id?: string
          is_required?: boolean
          key: string
          label: string
          options?: string[] | null
          package_id: string
          sort_order?: number
        }
        Update: {
          applies_to?: string
          field_type?: string
          id?: string
          is_required?: boolean
          key?: string
          label?: string
          options?: string[] | null
          package_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_custom_fields_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "package_custom_fields_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_extras: {
        Row: {
          capacity: number | null
          description: string | null
          id: string
          name: string
          package_id: string
          per: string
          price_cents: number
          sort_order: number
          status: string
        }
        Insert: {
          capacity?: number | null
          description?: string | null
          id?: string
          name: string
          package_id: string
          per?: string
          price_cents: number
          sort_order?: number
          status?: string
        }
        Update: {
          capacity?: number | null
          description?: string | null
          id?: string
          name?: string
          package_id?: string
          per?: string
          price_cents?: number
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_extras_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "package_extras_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_inclusions: {
        Row: {
          id: string
          kind: string
          package_id: string
          position: number
          text: string
        }
        Insert: {
          id?: string
          kind: string
          package_id: string
          position: number
          text: string
        }
        Update: {
          id?: string
          kind?: string
          package_id?: string
          position?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_inclusions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "package_inclusions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_prices: {
        Row: {
          base_price_cents: number
          child_price_cents: number | null
          currency: string
          deposit_value: number | null
          infant_price_cents: number | null
          package_id: string
          single_supplement_cents: number
        }
        Insert: {
          base_price_cents: number
          child_price_cents?: number | null
          currency: string
          deposit_value?: number | null
          infant_price_cents?: number | null
          package_id: string
          single_supplement_cents?: number
        }
        Update: {
          base_price_cents?: number
          child_price_cents?: number | null
          currency?: string
          deposit_value?: number | null
          infant_price_cents?: number | null
          package_id?: string
          single_supplement_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "package_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["currency"]
          },
          {
            foreignKeyName: "package_prices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "package_prices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          balance_due_days_before: number
          base_price_cents: number
          cancellation_policy_id: string | null
          category_id: string | null
          child_price_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          deposit_type: string
          deposit_value: number
          destination_id: string | null
          duration_days: number | null
          duration_label: string | null
          duration_nights: number | null
          gallery: string[]
          hero_image: string | null
          id: string
          infant_price_cents: number | null
          is_featured: boolean
          latitude: number | null
          longitude: number | null
          meeting_point: string | null
          meta_description: string | null
          meta_title: string | null
          minimum_age: number | null
          overview: string | null
          partner_id: string | null
          physical_rating: string | null
          single_supplement_cents: number
          slug: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          what_to_bring: string | null
        }
        Insert: {
          balance_due_days_before?: number
          base_price_cents: number
          cancellation_policy_id?: string | null
          category_id?: string | null
          child_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_type?: string
          deposit_value?: number
          destination_id?: string | null
          duration_days?: number | null
          duration_label?: string | null
          duration_nights?: number | null
          gallery?: string[]
          hero_image?: string | null
          id?: string
          infant_price_cents?: number | null
          is_featured?: boolean
          latitude?: number | null
          longitude?: number | null
          meeting_point?: string | null
          meta_description?: string | null
          meta_title?: string | null
          minimum_age?: number | null
          overview?: string | null
          partner_id?: string | null
          physical_rating?: string | null
          single_supplement_cents?: number
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          what_to_bring?: string | null
        }
        Update: {
          balance_due_days_before?: number
          base_price_cents?: number
          cancellation_policy_id?: string | null
          category_id?: string | null
          child_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_type?: string
          deposit_value?: number
          destination_id?: string | null
          duration_days?: number | null
          duration_label?: string | null
          duration_nights?: number | null
          gallery?: string[]
          hero_image?: string | null
          id?: string
          infant_price_cents?: number | null
          is_featured?: boolean
          latitude?: number | null
          longitude?: number | null
          meeting_point?: string | null
          meta_description?: string | null
          meta_title?: string | null
          minimum_age?: number | null
          overview?: string | null
          partner_id?: string | null
          physical_rating?: string | null
          single_supplement_cents?: number
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          what_to_bring?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_cancellation_policy_fk"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          approved_user_id: string | null
          company_name: string
          contact_name: string
          country: string | null
          created_at: string
          departures_per_year: number | null
          email: string
          id: string
          message: string | null
          operating_regions: string | null
          phone: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_ip: string | null
          tour_types: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          approved_user_id?: string | null
          company_name: string
          contact_name: string
          country?: string | null
          created_at?: string
          departures_per_year?: number | null
          email: string
          id?: string
          message?: string | null
          operating_regions?: string | null
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_ip?: string | null
          tour_types?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          approved_user_id?: string | null
          company_name?: string
          contact_name?: string
          country?: string | null
          created_at?: string
          departures_per_year?: number | null
          email?: string
          id?: string
          message?: string | null
          operating_regions?: string | null
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_ip?: string | null
          tour_types?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_applications_approved_user_id_fkey"
            columns: ["approved_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          kind: string
          processor_fee_cents: number | null
          provider: string
          provider_ref: string | null
          recorded_by: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          kind: string
          processor_fee_cents?: number | null
          provider?: string
          provider_ref?: string | null
          recorded_by?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          processor_fee_cents?: number | null
          provider?: string
          provider_ref?: string | null
          recorded_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          balance_reminder_days: number
          company_name: string | null
          contact_address: Json | null
          contact_email: string | null
          contact_phone: string | null
          default_currency: string
          hold_minutes: number
          id: boolean
          installment_reminder_days: number
          payment_window_minutes: number
          pre_departure_days: number
          registration_number: string | null
          social_links: Json
          statutory_notice: string | null
          tax_rates: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          balance_reminder_days?: number
          company_name?: string | null
          contact_address?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          default_currency?: string
          hold_minutes?: number
          id?: boolean
          installment_reminder_days?: number
          payment_window_minutes?: number
          pre_departure_days?: number
          registration_number?: string | null
          social_links?: Json
          statutory_notice?: string | null
          tax_rates?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          balance_reminder_days?: number
          company_name?: string | null
          contact_address?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          default_currency?: string
          hold_minutes?: number
          id?: boolean
          installment_reminder_days?: number
          payment_window_minutes?: number
          pre_departure_days?: number
          registration_number?: string | null
          social_links?: Json
          statutory_notice?: string | null
          tax_rates?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          body: string
          id: string
          is_default: boolean
          kind: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          body: string
          id?: string
          is_default?: boolean
          kind: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          body?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotion_packages: {
        Row: {
          package_id: string
          promotion_id: string
        }
        Insert: {
          package_id: string
          promotion_id: string
        }
        Update: {
          package_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "promotion_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_packages_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          per_user_limit: number | null
          status: string
          usage_count: number
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          per_user_limit?: number | null
          status?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          per_user_limit?: number | null
          status?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      room_types: {
        Row: {
          description: string | null
          id: string
          is_default: boolean
          max_occupancy: number
          name: string
          package_id: string
          price_adjustment_cents: number
          sort_order: number
        }
        Insert: {
          description?: string | null
          id?: string
          is_default?: boolean
          max_occupancy?: number
          name: string
          package_id: string
          price_adjustment_cents?: number
          sort_order?: number
        }
        Update: {
          description?: string | null
          id?: string
          is_default?: boolean
          max_occupancy?: number
          name?: string
          package_id?: string
          price_adjustment_cents?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_types_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_from_price"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "room_types_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      static_pages: {
        Row: {
          body: string
          meta_description: string | null
          meta_title: string | null
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "static_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      travellers: {
        Row: {
          accessibility_notes: string | null
          booking_id: string
          date_of_birth: string | null
          dietary_notes: string | null
          emergency_contact: Json | null
          id: string
          is_lead: boolean
          legal_name: string
          position: number
          traveller_type: string
        }
        Insert: {
          accessibility_notes?: string | null
          booking_id: string
          date_of_birth?: string | null
          dietary_notes?: string | null
          emergency_contact?: Json | null
          id?: string
          is_lead?: boolean
          legal_name: string
          position: number
          traveller_type: string
        }
        Update: {
          accessibility_notes?: string | null
          booking_id?: string
          date_of_birth?: string | null
          dietary_notes?: string | null
          emergency_contact?: Json | null
          id?: string
          is_lead?: boolean
          legal_name?: string
          position?: number
          traveller_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "travellers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: Json | null
          closed_at: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          phone: string | null
          role: string
          status: string
        }
        Insert: {
          address?: Json | null
          closed_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          marketing_opt_in?: boolean
          phone?: string | null
          role?: string
          status?: string
        }
        Update: {
          address?: Json | null
          closed_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          role?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      package_from_price: {
        Row: {
          bookable_departures: number | null
          currency: string | null
          from_price_cents: number | null
          next_departure_on: string | null
          package_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_booking: {
        Args: { p_booking: string; p_session: string }
        Returns: boolean
      }
      approve_partner_application: {
        Args: {
          p_application: string
          p_note?: string
          p_reviewer: string
          p_user: string
        }
        Returns: undefined
      }
      claim_email_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body_snapshot: string | null
          booking_id: string | null
          created_at: string
          dedupe_key: string | null
          departure_id: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          merge_data: Json
          provider: string
          provider_ref: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject_snapshot: string | null
          template_key: string
          to_email: string
          to_name: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_seats: {
        Args: {
          p_departure: string
          p_seats: number
          p_session: string
          p_user?: string
        }
        Returns: {
          booking_id: string | null
          created_at: string
          departure_id: string
          expires_at: string
          id: string
          released_at: string | null
          seats: number
          session_token: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "booking_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_hold_seats: { Args: { p_booking: string }; Returns: boolean }
      create_booking: {
        Args: { p_payload: Json }
        Returns: {
          adults: number
          amount_paid_cents: number
          balance_cents: number | null
          balance_due_on: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_session_ref: string | null
          children: number
          created_at: string
          currency: string
          departure_id: string
          deposit_due_cents: number
          discount_cents: number
          fees_cents: number
          fx_rate_to_base: number | null
          id: string
          infants: number
          lead_address: Json | null
          lead_email: string
          lead_name: string
          lead_phone: string | null
          notes_internal: string | null
          package_id: string
          promotion_id: string | null
          reference: string
          room_type_id: string | null
          single_supplement: boolean
          status: string
          subtotal_cents: number
          supplier_cost_base_cents: number | null
          supplier_cost_cents: number | null
          tax_cents: number
          total_base_cents: number | null
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_role: { Args: never; Returns: string }
      departure_seats_available: {
        Args: { d: Database["public"]["Tables"]["departures"]["Row"] }
        Returns: number
      }
      effective_price_cents: {
        Args: { p_currency: string; p_departure_id: string }
        Returns: number
      }
      enqueue_due_reminders: { Args: never; Returns: number }
      enqueue_email: { Args: { p_payload: Json }; Returns: string }
      expire_stale_holds: { Args: { p_departure?: string }; Returns: number }
      extend_hold: {
        Args: { p_hold: string; p_session: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_partner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mark_email_failed: {
        Args: { p_error: string; p_id: string; p_max_attempts?: number }
        Returns: undefined
      }
      mark_email_sent: {
        Args: {
          p_body: string
          p_id: string
          p_provider_ref: string
          p_subject: string
        }
        Returns: undefined
      }
      next_booking_reference: { Args: never; Returns: string }
      owns_package: { Args: { pkg: string }; Returns: boolean }
      record_payment: {
        Args: { p_payload: Json }
        Returns: {
          adults: number
          amount_paid_cents: number
          balance_cents: number | null
          balance_due_on: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_session_ref: string | null
          children: number
          created_at: string
          currency: string
          departure_id: string
          deposit_due_cents: number
          discount_cents: number
          fees_cents: number
          fx_rate_to_base: number | null
          id: string
          infants: number
          lead_address: Json | null
          lead_email: string
          lead_name: string
          lead_phone: string | null
          notes_internal: string | null
          package_id: string
          promotion_id: string | null
          reference: string
          room_type_id: string | null
          single_supplement: boolean
          status: string
          subtotal_cents: number
          supplier_cost_base_cents: number | null
          supplier_cost_cents: number | null
          tax_cents: number
          total_base_cents: number | null
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_partner_application: {
        Args: { p_application: string; p_note?: string; p_reviewer: string }
        Returns: undefined
      }
      release_hold: {
        Args: { p_hold: string; p_session: string }
        Returns: boolean
      }
      submit_partner_application: { Args: { p_payload: Json }; Returns: string }
    }
    Enums: {
      application_status: "pending" | "approved" | "rejected" | "withdrawn"
      email_status: "queued" | "sending" | "sent" | "failed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: ["pending", "approved", "rejected", "withdrawn"],
      email_status: ["queued", "sending", "sent", "failed", "cancelled"],
    },
  },
} as const
